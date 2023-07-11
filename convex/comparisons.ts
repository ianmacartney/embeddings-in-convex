import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { pineconeIndex } from "./lib/pinecone";
import { v } from "convex/values";
import { pruneNull } from "./lib/utils";

export const upsert = mutation({
  args: { target: v.id("chunks"), count: v.optional(v.number()) },
  handler: async (ctx, { target, count }) => {
    const topK = count || 10;
    const existing = await ctx.db
      .query("comparisons")
      .withIndex("target", (q) => q.eq("target", target))
      .filter((q) => q.gte(q.field("count"), topK))
      .unique();
    if (existing) return existing._id;
    const comparisonId = await ctx.db.insert("comparisons", {
      target,
      count: topK,
    });
    await ctx.scheduler.runAfter(0, api.comparisons.compare, {
      target,
      comparisonId,
      topK,
    });
    return comparisonId;
  },
});

export const compare = action({
  args: {
    target: v.id("chunks"),
    comparisonId: v.optional(v.id("comparisons")),
    topK: v.number(),
  },
  handler: async (ctx, { target, comparisonId, topK }) => {
    const pineconeStart = Date.now();
    const pinecone = await pineconeIndex();
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
    const queryMs = Date.now() - pineconeStart;
    console.log({
      queryMs,
    });
    if (comparisonId) {
      await ctx.runMutation(internal.comparisons.patch, {
        id: comparisonId,
        patch: {
          relatedChunks,
          // stats
          queryMs,
        },
      });
    }
    return relatedChunks;
  },
});

export const get = query({
  args: { comparisonId: v.id("comparisons") },
  handler: async (ctx, { comparisonId }) => {
    const comparison = await ctx.db.get(comparisonId);
    if (!comparison) throw new Error("Unknown comparison");
    if (!comparison.relatedChunks) return null;
    const target = await ctx.db.get(comparison.target);
    return (
      target && {
        ...comparison,
        relatedChunks: pruneNull(
          await Promise.all(
            comparison.relatedChunks
              .filter(({ id }) => id !== comparison.target)
              .map(async ({ id, score }) => {
                const chunk = await ctx.db.get(id);
                if (!chunk) return null;
                const source = await ctx.db.get(chunk.sourceId);
                return { ...chunk, score, sourceName: source!.name };
              })
          )
        ),
        target: {
          ...target,
          sourceName: (await ctx.db.get(target.sourceId))!.name,
        },
      }
    );
  },
});

export const patch = internalMutation({
  args: { id: v.id("comparisons"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    return await ctx.db.patch(id, patch);
  },
});
