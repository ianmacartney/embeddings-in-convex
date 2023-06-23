import pLimit from "p-limit";
import { PaginationOptions, paginationOptsValidator } from "convex/server";
import { api } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { fetchEmbeddingBatch } from "./lib/embeddings";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { pineconeIndex } from "./lib/pinecone";

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

// Insert the source into the DB, along with the associated chunks.
export const insert = internalMutation(
  async (
    { db },
    {
      name,
      chunks,
      float32Buffers,
      totalTokens,
      embeddingMs,
    }: {
      name: string;
      chunks: { text: string; lines: { from: number; to: number } }[];
      float32Buffers: ArrayBuffer[];
      totalTokens: number;
      embeddingMs: number;
    }
  ) => {
    const sourceId = await db.insert("sources", {
      name,
      chunkIds: [],
      saved: true, // Saving the vectors in Convex directly
      totalTokens,
      embeddingMs,
    });
    const totalLength = textLength(chunks);
    const chunkIds = await Promise.all(
      chunks.map(async ({ text, lines }, chunkIndex) => {
        const chunkId = await db.insert("chunks", {
          text,
          sourceId,
          chunkIndex,
          lines,
          tokens: Math.ceil((totalTokens * text.length) / totalLength),
        });
        await db.insert("vectors", {
          chunkId,
          float32Buffer: float32Buffers[chunkIndex],
        });
        return chunkId;
      })
    );
    await db.patch(sourceId, { chunkIds });
    return { sourceId, chunkIds };
  }
);

// Create a new source with the given chunks, storing embeddings for the chunks.
export const add = action(
  async (
    { runMutation },
    {
      name,
      chunks,
    }: {
      name: string;
      chunks: { text: string; lines: { from: number; to: number } }[];
    }
  ) => {
    const { embeddings, embeddingMs, totalTokens } = await fetchEmbeddingBatch(
      chunks.map(({ text }) => text.replace(/\n/g, " "))
    );
    console.log({
      batchSize: chunks.length,
      totalTokens,
      embeddingMs,
    });
    await runMutation(api.sources.insert, {
      name,
      chunks,
      float32Buffers: embeddings.map((e) => Float32Array.from(e).buffer),
      totalTokens,
      embeddingMs,
    });
  }
);

/**
 * Add a batch of sources, where each one is a named source with all chunks.
 */
export const addBatch = action(
  async (
    { runMutation },
    {
      batch,
    }: {
      batch: {
        name: string;
        chunks: { text: string; lines: { from: number; to: number } }[];
      }[];
    }
  ) => {
    // Calculate all the embeddings for all sources at once.
    const { embeddings, totalTokens, embeddingMs } = await fetchEmbeddingBatch(
      batch.flatMap(({ chunks }) =>
        chunks.map(({ text }) => text.replace(/\n/g, " "))
      )
    );
    // The length of all strings put together.
    const totalLength = batch.reduce(
      (sum, { chunks }) => sum + textLength(chunks),
      0
    );
    console.log({ batchSize: embeddings.length, totalTokens, embeddingMs });
    // This allows us to only run 100 inserts in parallel at once.
    // We could also add a batch insert mutation in the future.
    const limit = pLimit(100);
    // How far into the overall embeddigns list to pull a given batch.
    const offsets = batch.reduce(
      (acc, cur) => [...acc, acc[acc.length - 1] + cur.chunks.length],
      [0]
    );
    await Promise.all(
      batch.map(({ name, chunks }, idx) =>
        limit(async () => {
          const sourceLength = textLength(chunks);
          const portion = sourceLength / totalLength;
          await runMutation(api.sources.insert, {
            name,
            chunks,
            float32Buffers: embeddings
              .slice(offsets[idx], offsets[idx] + chunks.length)
              .map((e) => Float32Array.from(e).buffer),
            // estimate
            embeddingMs: Math.ceil(embeddingMs * portion),
            totalTokens: Math.ceil(totalTokens * portion),
          });
        })
      )
    );
  }
);

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
  async ({ db }, { id }: { id: Id<"sources"> }) => {
    const source = await db.get(id);
    if (!source) return;
    await db.delete(id);
    await Promise.all(source.chunkIds.map(db.delete));
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

function textLength(chunks: { text: string }[]) {
  return chunks.reduce((sum, cur) => sum + cur.text.length, 0);
}

export const addVectorBatch = mutation(
  async (
    { db },
    {
      batch,
    }: { batch: { chunkId: Id<"chunks">; float32Buffer: ArrayBuffer }[] }
  ) => {
    await Promise.all(
      batch.map(async (vector) => {
        const existing = await db
          .query("vectors")
          .withIndex("by_chunkId", (q) => q.eq("chunkId", vector.chunkId))
          .unique();
        if (!existing) await db.insert("vectors", vector);
      })
    );
  }
);

export const copyToConvex = action(async ({ runMutation, runQuery }) => {
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    const result: {
      continueCursor: string;
      isDone: boolean;
      page: Doc<"chunks">[];
    } = await runQuery(api.sources.paginateChunks, {
      paginationOpts: { cursor, numItems: 100 },
    });
    const pinecone = await pineconeIndex();
    const { vectors } = await pinecone.fetch({
      namespace: "chunks",
      ids: result.page.map((chunk) => chunk._id),
    });
    if (!vectors) throw new Error("No vectors from Pinecone");
    await runMutation(api.sources.addVectorBatch, {
      batch: result.page.map((chunk) => ({
        chunkId: chunk._id,
        float32Buffer: Float32Array.from(vectors[chunk._id].values).buffer,
      })),
    });

    ({ isDone, continueCursor: cursor } = result);
  }
});
