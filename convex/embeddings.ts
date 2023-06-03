import { Id } from "./_generated/dataModel";
import {
  DatabaseReader,
  action,
  internalMutation,
  query,
} from "./_generated/server";
import { getRawText } from "./texts";

export async function fetchEmbeddingBatch(texts: string[]) {
  console.log("getting embeddings for ", texts);
  const start = Date.now();
  const result = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
    },

    body: JSON.stringify({
      model: "text-embedding-ada-002",
      input: texts,
    }),
  });
  const elapsedMs = Date.now() - start;

  const jsonresults = await result.json();
  if (jsonresults.data.length !== texts.length) {
    console.error(result);
    throw new Error("Unexpected number of embeddings");
  }
  const allembeddings = jsonresults.data as {
    embedding: number[];
    index: number;
  }[];
  allembeddings.sort((a, b) => b.index - a.index);
  const embeddings = allembeddings.map(({ embedding }) =>
    Float32Array.from(embedding)
  );
  return {
    embeddings,
    stats: {
      numTexts: texts.length,
      totalTokens: jsonresults.usage.total_tokens,
      totalLength: texts.reduce((acc, cur) => acc + cur.length, 0),
      elapsedMs,
    },
  };
}

export async function fetchEmbedding(text: string) {
  const { embeddings, stats } = await fetchEmbeddingBatch([text]);
  return { embedding: embeddings[0], stats };
}

export const create = action(
  async (
    { runMutation, runQuery, storage },
    { textId }: { textId: Id<"texts"> }
  ) => {
    const textDoc = await runQuery("texts:get", { textId });
    const rawText = await getRawText(storage, textDoc);
    const { embedding, stats } = await fetchEmbedding(rawText);
    await runMutation("embeddings:saveEmbedding", { textId, embedding, stats });

    console.log(embedding);
  }
);

/**
 * Compares two embeddings by doing a dot product.
 *
 * This works assuming both vectors are normalized to length 1.
 * @returns [-1, 1] based on similarity. (1 is the same, -1 is the opposite)
 */
export function compare(vectorA: Float32Array, vectorB: Float32Array) {
  return vectorA.reduce((acc, cur, idx) => acc + cur * vectorB[idx], 0);
}

export function compareBuffers(vectorA: ArrayBuffer, vectorB: ArrayBuffer) {
  return compare(new Float32Array(vectorA), new Float32Array(vectorB));
}

export const saveEmbedding = internalMutation(
  async (
    { db },
    {
      textId,
      embedding,
      stats,
    }: {
      textId: Id<"texts">;
      embedding: Float32Array;
      stats: {
        numTexts: number;
        totalTokens: number;
        totalLength: number;
        elapsedMs: number;
      };
    }
  ) => {
    const embeddingId = await db.insert("embeddings", {
      vector: embedding.buffer,
    });
    await db.patch(textId, { embeddingId });
    await db.insert("embeddingStats", {
      ...stats,
      embeddingId,
    });
  }
);

export async function getEmbedding(
  db: DatabaseReader,
  embeddingId: Id<"embeddings">
) {
  const result = await db.get(embeddingId);
  if (!result) {
    throw new Error("No embedding found");
  }
  return new Float32Array(result.vector);
}
