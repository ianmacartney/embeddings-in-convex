import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
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
    const chunk = await ctx.db.get(target);
    if (!chunk) throw new Error("Unknown chunk");
    if (!chunk.embeddingId) throw new Error("Chunk has no embedding yet");
    const embedding = await ctx.db.get(chunk.embeddingId);
    if (!embedding) throw new Error("Unknown embedding");
    await ctx.scheduler.runAfter(0, internal.comparisons.compare, {
      vector: embedding.vector,
      comparisonId,
      topK,
    });
    return comparisonId;
  },
});

export const compare = internalAction({
  args: {
    vector: v.array(v.number()),
    comparisonId: v.optional(v.id("comparisons")),
    topK: v.number(),
  },
  handler: async (ctx, { vector, comparisonId, topK }) => {
    const start = Date.now();
    const matches = await ctx.vectorSearch("chunkEmbeddings", "vector", {
      vector,
      limit: topK,
    });
    if (!matches) throw new Error("Pinecone matches are empty");
    const relatedChunks = matches.map(({ _id, _score }) => ({
      id: _id,
      score: _score,
    }));
    const queryMs = Date.now() - start;
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
            comparison.relatedChunks.map(async ({ id, score }) => {
              const chunk = await ctx.db
                .query("chunks")
                .withIndex("embeddingId", (q) => q.eq("embeddingId", id))
                .unique();
              if (chunk?._id === comparison.target) return null;
              if (!chunk) throw new Error("Unknown chunk for embedding" + id);
              const source = await ctx.db.get(chunk.sourceId);
              if (!source) throw new Error("Unknown source" + chunk.sourceId);
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
