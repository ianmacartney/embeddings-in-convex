import { PaginationOptions, paginationOptsValidator } from "convex/server";
import { api } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { fetchEmbeddingBatch } from "./lib/embeddings";
import { pineconeClient } from "./lib/pinecone";
import { v } from "convex/values";

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
    const totalLength = chunks.reduce((acc, cur) => acc + cur.text.length, 0);
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
    const pinecone = await pineconeClient();
    await pinecone.upsert({
      upsertRequest: {
        namespace: "chunks",
        vectors: chunkIds.map((id, chunkIndex) => ({
          id,
          values: embeddings[chunkIndex],
          metadata: { name, sourceId: sourceId, chunkIndex },
        })),
      },
    });
    await runMutation(api.sources.patch, {
      id: sourceId,
      patch: { saved: true },
    });
  }
);

// export const createBatch = action(
//   async (
//     { runMutation },
//     {
//       batch,
//     }: {
//       batch: {
//         name: string;
//         chunks: { text: string; lines: { from: number; to: number } }[];
//       }[];
//     }
//   ) => {
//     const { embeddings, stats } = await fetchEmbeddingBatch(
//       batch.flatMap(({ chunks }) =>
//         chunks.map(({ text }) => text.replace(/\n/g, " "))
//       )
//     );
//     console.log(stats);
//     const pinecone = pineconeClient("sources");
// 		let emeddingIdx = 0;
// 		const vectors = await Promise.all(batch.map(({name, chunks}) => {
//     const { sourceId, chunkIds } = await runMutation("sources:add", {
//       name,
//       chunks,
//     });
//     await pinecone.upsert({
//       vectors: chunkIds.map((id, chunkIndex) => ({
//         id: id.id,
//         values: embeddings[chunkIndex],
//         metadata: { name, sourceId: sourceId.id, chunkIndex },
//       })),
//     });
//     await runMutation("sources:patch", {
//       id: sourceId,
//       patch: { saved: true },
//     });
//   }
// );

export const patch = internalMutation({
  args: { id: v.id("sources"), patch: v.any() },
  handler: async ({ db }, { id, patch }) => {
    return await db.patch(id, patch);
  },
});

export const paginate = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async ({ db }, { paginationOpts }) => {
    return await db.query("sources").paginate(paginationOpts);
  },
});

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
export const getChunks = query({
  args: { ids: v.array(v.id("chunks")) },
  handler: async ({ db }, { ids }) => {
    return Promise.all(
      ids.map(async (id) => {
        const doc = await db.get(id);
        if (!doc) {
          throw new Error("Document not found: " + id);
        }
        return doc;
      })
    );
  },
});
