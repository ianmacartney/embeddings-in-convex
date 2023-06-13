"use node";
import { action } from "./_generated/server";
import { PineconeClient } from "pinecone-client";
import { fetchEmbedding, fetchEmbeddingBatch } from "./lib/embeddings";
import { Id } from "./_generated/dataModel";

export function pineconeClient(namespace?: "chunks" | "questions") {
  return new PineconeClient({
    apiKey: process.env.PINECONE_API_KEY,
    baseUrl: process.env.PINECONE_API_BASE_URL,
    namespace,
  });
}

export const addSearch = action(
  async (
    { runMutation },
    { input }: { input: string }
  ): Promise<Id<"searches">> => {
    const searchId = await runMutation("searches:insert", { input });
    const embeddingStart = Date.now();
    const embedding = await fetchEmbedding(input);
    const embeddingMs = Date.now() - embeddingStart;
    await runMutation("searches:patch", {
      id: searchId,
      patch: { embeddingMs },
    });
    const pineconeStart = Date.now();
    const pinecone = pineconeClient("chunks");
    const { matches } = await pinecone.query({ topK: 10, vector: embedding });
    const pineconeMs = Date.now() - pineconeStart;
    await pineconeClient("questions").upsert({
      vectors: [{ id: searchId.id, values: embedding, metadata: { input } }],
    });
    console.log({
      embeddingMs,
      pineconeMs,
      questionMs: Date.now() - pineconeStart - pineconeMs,
    });
    await runMutation("searches:patch", {
      id: searchId,
      patch: {
        relatedChunks: matches.map(({ id, score }) => ({
          id: new Id("chunks", id),
          score,
        })),
        pineconeMs,
      },
    });
    return searchId;
  }
);

// Create a new source with the given chunks, storing embeddings for the chunks.
export const createSource = action(
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
    const embeddings = await fetchEmbeddingBatch(
      chunks.map(({ text }) => text.replace(/\n/g, " "))
    );
    const pinecone = pineconeClient("chunks");
    const { sourceId, chunkIds } = await runMutation("sources:insert", {
      name,
      chunks,
    });
    await pinecone.upsert({
      vectors: chunkIds.map((id, chunkIndex) => ({
        id: id.id,
        values: embeddings[chunkIndex],
        metadata: { name, sourceId: sourceId.toString(), chunkIndex },
      })),
    });
    await runMutation("sources:patch", {
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
//     const { sourceId, chunkIds } = await runMutation("sources:insertBatch", {
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
