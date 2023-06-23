import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { pruneNull } from "./lib/utils";
import { compareTo } from "./lib/vectors";

export const upsert = mutation(
  async (
    { db },
    { target, count }: { target: Id<"chunks">; count?: number }
  ) => {
    const topK = count || 10;
    const existing = await db
      .query("comparisons")
      .withIndex("target", (q) => q.eq("target", target))
      .filter((q) => q.gte(q.field("count"), topK))
      .unique();
    if (existing) return existing._id;

    const vector = await db
      .query("vectors")
      .withIndex("by_chunkId", (q) => q.eq("chunkId", target))
      .unique();
    if (!vector) throw new Error("No vector found");
    const matches = await compareTo(db, new Float32Array(vector.float32Buffer));
    const relatedChunks = matches
      .filter(({ id }) => id !== target)
      .slice(0, topK);
    const comparisonId = await db.insert("comparisons", {
      target,
      relatedChunks,
      count: topK,
    });
    return comparisonId;
  }
);

export const get = query(
  async ({ db }, { comparisonId }: { comparisonId: Id<"comparisons"> }) => {
    const comparison = await db.get(comparisonId);
    if (!comparison) throw new Error("Unknown comparison");
    if (!comparison.relatedChunks) return null;
    const target = await db.get(comparison.target);
    return (
      target && {
        ...comparison,
        relatedChunks: pruneNull(
          await Promise.all(
            comparison.relatedChunks
              .filter(({ id }) => id !== comparison.target)
              .map(async ({ id, score }) => {
                const chunk = await db.get(id);
                if (!chunk) return null;
                const source = await db.get(chunk.sourceId);
                return { ...chunk, score, sourceName: source!.name };
              })
          )
        ),
        target: {
          ...target,
          sourceName: (await db.get(target.sourceId))!.name,
        },
      }
    );
  }
);
