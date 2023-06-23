import { DatabaseReader } from "../_generated/server";

export async function compareTo(db: DatabaseReader, target: Float32Array) {
  const vectors = await db.query("vectors").take(1300);
  const scores = await Promise.all(
    vectors.map(async (vector) => {
      const score = compare(target, new Float32Array(vector.float32Buffer));
      return { score, id: vector.chunkId };
    })
  );
  return scores.sort((a, b) => b.score - a.score);
}

/**
 * Compares two vectors by doing a dot product.
 *
 * This works assuming both vectors are normalized to length 1.
 * @returns [-1, 1] based on similarity. (1 is the same, -1 is the opposite)
 * Note: due to float approximation, it might be slightly less than -1 and
 * more than 1, and an exact match won't necessarily be 1.00
 */
export function compare(vectorA: Float32Array, vectorB: Float32Array) {
  return vectorA.reduce((acc, cur, idx) => acc + cur * vectorB[idx], 0);
}
