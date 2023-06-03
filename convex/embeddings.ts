import { Id } from "./_generated/dataModel";
import { action, internalMutation, query } from "./_generated/server";

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
  async ({ runMutation, runQuery }, { textId }: { textId: Id<"texts"> }) => {
    const textDoc = await runQuery("texts:get", { textId });
    const { embedding, stats } = await fetchEmbedding(textDoc.raw);
    await runMutation("embeddings:saveEmbedding", {
      textId,
      float32Buffer: embedding.buffer,
      stats,
    });
  }
);

export const compareTo = query(
  async ({ db }, { vectorId }: { vectorId?: Id<"vectors"> }) => {
    const vectors = await db.query("vectors").collect();
    if (!vectorId)
      return vectors.map((v) => ({
        score: null,
        vectorId: v._id,
        textId: v.textId,
      }));
    const vector = await db.get(vectorId);
    if (!vector) {
      throw new Error("Vector not found");
    }
    const targetEmbedding = new Float32Array(vector.float32Buffer);
    const scores = await Promise.all(
      vectors
        .filter((v) => !v._id.equals(vectorId))
        .map(async (vector) => {
          const score = compare(
            targetEmbedding,
            new Float32Array(vector.float32Buffer)
          );
          return { score, textId: vector.textId, vectorId: vector._id };
        })
    );
    return scores.sort((a, b) => b.score - a.score);
  }
);

/**
 * Compares two vectors by doing a dot product.
 *
 * This works assuming both vectors are normalized to length 1.
 * @returns [-1, 1] based on similarity. (1 is the same, -1 is the opposite)
 */
export function compare(vectorA: Float32Array, vectorB: Float32Array) {
  return vectorA.reduce((acc, cur, idx) => acc + cur * vectorB[idx], 0);
}

export const saveEmbedding = internalMutation(
  async (
    { db },
    {
      textId,
      float32Buffer,
      stats,
    }: {
      textId: Id<"texts">;
      float32Buffer: ArrayBuffer;
      stats: {
        numTexts: number;
        totalTokens: number;
        totalLength: number;
        elapsedMs: number;
      };
    }
  ) => {
    const vectorId = await db.insert("vectors", {
      float32Buffer,
      textId,
    });
    await db.insert("embeddingStats", {
      ...stats,
      vectorId,
    });
  }
);
