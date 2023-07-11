import { PaginationOptions, paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import {
  DatabaseWriter,
  internalAction,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { fetchEmbeddingBatch } from "./lib/embeddings";
import { pineconeIndex, upsertVectors } from "./lib/pinecone";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";

type InputChunk = { text: string; lines: { from: number; to: number } };

async function addSource(
  db: DatabaseWriter,
  name: string,
  chunks: InputChunk[]
) {
  const sourceId = await db.insert("sources", {
    name,
    chunkIds: [],
    saved: false,
  });
  const chunkIds = await Promise.all(
    chunks.map(({ text, lines }, chunkIndex) =>
      db.insert("chunks", {
        text,
        sourceId,
        chunkIndex,
        lines,
      })
    )
  );
  await db.patch(sourceId, { chunkIds });
  return (await db.get(sourceId))!;
}

// Insert the source into the DB, along with the associated chunks.
export const add = mutation(
  async (
    { db, scheduler },
    {
      name,
      chunks,
    }: {
      name: string;
      chunks: InputChunk[];
    }
  ) => {
    const source = await addSource(db, name, chunks);
    await scheduler.runAfter(0, internal.sources.addEmbedding, {
      source,
      texts: chunks.map(({ text }) => text),
    });
  }
);

// Make embeddings for a source's chunks and store them.
export const addEmbedding = internalAction(
  async (
    { runMutation },
    { source, texts }: { source: Doc<"sources">; texts: string[] }
  ) => {
    const { embeddings, embeddingMs, totalTokens } = await fetchEmbeddingBatch(
      texts
    );
    console.log({
      batchSize: texts.length,
      totalTokens,
      embeddingMs,
    });
    await upsertVectors(
      "chunks",
      source.chunkIds.map((id, chunkIndex) => ({
        id,
        values: embeddings[chunkIndex],
        metadata: { sourceId: source._id, textLen: texts[chunkIndex].length },
      }))
    );
    await runMutation(internal.sources.patch, {
      id: source._id,
      patch: { saved: true, totalTokens, embeddingMs },
    });
  }
);

/**
 * Add a batch of sources, where each one is a named source with all chunks.
 */
export const addBatch = mutation(
  async (
    { db, scheduler },
    {
      batch,
    }: {
      batch: {
        name: string;
        chunks: { text: string; lines: { from: number; to: number } }[];
      }[];
    }
  ) => {
    await scheduler.runAfter(0, internal.sources.addEmbeddingBatch, {
      batch: await Promise.all(
        batch.map(async ({ name, chunks }) => ({
          source: await addSource(db, name, chunks),
          texts: chunks.map(({ text }) => text),
        }))
      ),
    });
  }
);

export const addEmbeddingBatch = internalAction(
  async (
    { runMutation },
    { batch }: { batch: { source: Doc<"sources">; texts: string[] }[] }
  ) => {
    // Calculate all the embeddings for all sources at once.
    const { embeddings, totalTokens, embeddingMs } = await fetchEmbeddingBatch(
      batch.flatMap(({ texts }) => texts)
    );
    console.log({ batchSize: embeddings.length, totalTokens, embeddingMs });
    const offsets = batch.reduce(
      (acc, { texts }) => [...acc, acc[acc.length - 1] + texts.length],
      [0]
    );
    const vectors = await Promise.all(
      batch.map(({ source, texts }, idx) => {
        const vectors = source.chunkIds.map((id, chunkIndex) => ({
          id,
          values: embeddings[offsets[idx] + chunkIndex],
          metadata: { sourceId: source._id, textLen: texts[idx].length },
        }));
        return vectors;
      })
    );
    await upsertVectors(
      "chunks",
      vectors.flatMap((vectors) => vectors)
    );
    // The length of all strings put together.
    const totalLength = batch.reduce(
      (sum, { texts }) => sum + textLength(texts),
      0
    );
    await Promise.all(
      batch.map(async ({ source, texts }) => {
        const sourceLength = textLength(texts);
        const portion = sourceLength / totalLength;
        await runMutation(internal.sources.patch, {
          id: source._id,
          patch: {
            saved: true,
            embeddingMs: Math.ceil(embeddingMs * portion),
            totalTokens: Math.ceil(totalTokens * portion),
          },
        });
      })
    );
  }
);

function textLength(texts: string[]) {
  return texts.reduce((sum, cur) => sum + cur.length, 0);
}

export const patch = internalMutation({
  args: { id: v.id("sources"), patch: v.any() },
  handler: async ({ db }, { id, patch }) => {
    return await db.patch(id, patch);
  },
});

export const paginate = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async ({ db }, { paginationOpts }) => {
    const results = await db
      .query("sources")
      .order("desc")
      .paginate(paginationOpts);

    return {
      ...results,
      page: await Promise.all(
        results.page.map(async (source) => {
          let firstChunkText = "";
          if (source.chunkIds.length) {
            const firstChunk = await db.get(source.chunkIds[0]);
            firstChunkText = firstChunk?.text ?? "";
          }
          return { ...source, firstChunkText };
        })
      ),
    };
  },
});

export const deleteSource = mutation(
  async ({ db, scheduler }, { id }: { id: Id<"sources"> }) => {
    const source = await db.get(id);
    if (!source) return;
    await db.delete(id);
    await Promise.all(source.chunkIds.map(db.delete));
    scheduler.runAfter(0, internal.sources.deletePineconeVectors, {
      ids: source.chunkIds,
    });
  }
);

export const deletePineconeVectors = internalAction(
  async (_, { ids }: { ids: string[] }) => {
    const pinecone = await pineconeIndex();
    await pinecone.delete1({ namespace: "chunks", ids });
  }
);

export const paginateChunks = query(
  async ({ db }, { paginationOpts }: { paginationOpts: PaginationOptions }) => {
    const results = await db.query("chunks").paginate(paginationOpts);

    return {
      ...results,
      page: await Promise.all(
        results.page.map(async (chunk) => {
          const source = await db.get(chunk.sourceId);
          return { ...chunk, sourceName: source!.name };
        })
      ),
    };
  }
);

export const getChunk = query({
  args: { id: v.id("chunks") },
  handler: async ({ db }, { id }) => {
    const doc = await db.get(id);
    if (!doc) {
      throw new Error("Document not found: " + id);
    }
    return doc;
  },
});
