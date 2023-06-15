import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { crud } from "./lib/crud";
import { pineconeClient } from "./lib/pinecone";

export const { patch } = crud("comparisons");

export const upsert = mutation(
  async (
    { db, scheduler },
    { target, count }: { target: Id<"chunks">; count?: number }
  ) => {
    const topK = count || 10;
    const existing = await db
      .query("comparisons")
      .withIndex("target", (q) => q.eq("target", target))
      .filter((q) => q.gte(q.field("count"), topK))
      .unique();
    if (existing) return existing._id;
    const comparisonId = await db.insert("comparisons", {
      target,
      count: topK,
    });
    await scheduler.runAfter(0, api.comparisons.compare, {
      target,
      comparisonId,
      topK,
    });
    return comparisonId;
  }
);

export const compare = action(
  async (
    { runMutation },
    {
      target,
      comparisonId,
      topK,
    }: { target: Id<"chunks">; comparisonId?: Id<"comparisons">; topK: number }
  ) => {
    const pineconeStart = Date.now();
    const pinecone = await pineconeClient();
    const { matches } = await pinecone.query({
      queryRequest: {
        namespace: "chunks",
        topK,
        id: target,
      },
    });
    if (!matches) throw new Error("Pinecone matches are empty");
    const relatedChunks = matches.map(({ id, score }) => ({
      id: id as Id<"chunks">,
      score,
    }));
    const pineconeMs = Date.now() - pineconeStart;
    console.log({
      pineconeMs,
    });
    if (comparisonId) {
      await runMutation(api.comparisons.patch, {
        id: comparisonId,
        patch: {
          relatedChunks,
          // stats
          pineconeMs,
        },
      });
    }
    return relatedChunks;
  }
);

export const get = query(
  async ({ db }, { comparisonId }: { comparisonId: Id<"comparisons"> }) => {
    const comparison = await db.get(comparisonId);
    if (!comparison) throw new Error("Unknown comparison");
    if (!comparison.relatedChunks) return null;
    return await Promise.all(
      comparison.relatedChunks.map(async ({ id, score }) => {
        const chunk = await db.get(id);
        const source = await db.get(chunk!.sourceId);
        return { ...chunk!, score, sourceName: source!.name };
      })
    );
  }
);
