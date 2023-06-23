import pLimit from "p-limit";
import { PaginationOptions, paginationOptsValidator } from "convex/server";
import { api } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { fetchEmbeddingBatch } from "./lib/embeddings";
import { upsertVectors } from "./lib/pinecone";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

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
      totalTokens,
      embeddingMs,
    }: {
      name: string;
      chunks: { text: string; lines: { from: number; to: number } }[];
      totalTokens: number;
      embeddingMs: number;
    }
  ) => {
    const sourceId = await db.insert("sources", {
      name,
      chunkIds: [],
      saved: false,
      totalTokens,
      embeddingMs,
    });
    const totalLength = textLength(chunks);
    const chunkIds = await Promise.all(
      chunks.map(({ text, lines }, chunkIndex) =>
        db.insert("chunks", {
          text,
          sourceId,
          chunkIndex,
          lines,
          tokens: Math.ceil((totalTokens * text.length) / totalLength),
        })
      )
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
    const { sourceId, chunkIds } = await runMutation(api.sources.insert, {
      name,
      chunks,
      totalTokens,
      embeddingMs,
    });
    await upsertVectors(
      "chunks",
      chunkIds.map((id, chunkIndex) => ({
        id,
        values: embeddings[chunkIndex],
        metadata: { name, sourceId: sourceId, chunkIndex },
      }))
    );
    await runMutation(api.sources.patch, {
      id: sourceId,
      patch: { saved: true },
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
    const offsets = [0, ...batch.map((s) => s.chunks.length)];
    const sources = await Promise.all(
      batch.map(({ name, chunks }, idx) =>
        limit(async () => {
          const sourceLength = textLength(chunks);
          const portion = sourceLength / totalLength;
          const { sourceId, chunkIds } = await runMutation(api.sources.insert, {
            name,
            chunks,
            // estimate
            embeddingMs: Math.ceil(embeddingMs * portion),
            totalTokens: Math.ceil(totalTokens * portion),
          });
          const vectors = chunkIds.map((id, chunkIndex) => ({
            id,
            values: embeddings[offsets[idx] + chunkIndex],
            metadata: { name, sourceId: sourceId, chunkIndex },
          }));
          return { sourceId, vectors };
        })
      )
    );
    const vectors = sources.flatMap(({ vectors }) => vectors);
    await upsertVectors("chunks", vectors);
    await Promise.all(
      sources.map(async ({ sourceId }) => {
        await runMutation(api.sources.patch, {
          id: sourceId,
          patch: { saved: true },
        });
      })
    );
  }
);

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
