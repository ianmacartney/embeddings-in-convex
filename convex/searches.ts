import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { fetchEmbedding } from "./lib/embeddings";
import { Id } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";

export const upsert = mutation({
  args: { input: v.string(), count: v.optional(v.number()) },
  handler: async (ctx, { input, count: countOpt }) => {
    const count = countOpt || 10;
    const existing = await ctx.db
      .query("searches")
      .withIndex("input", (q) => q.eq("input", input))
      .filter((q) => q.gte(q.field("count"), count))
      .unique();
    if (existing) {
      console.log("Re-using search for", input);
      return existing._id;
    }
    const searchId = await ctx.db.insert("searches", { input, count });
    console.log("Starting search for", input);
    await ctx.scheduler.runAfter(0, api.searches.search, {
      input,
      searchId,
      topK: count,
    });
    return searchId;
  },
});

export const search = action({
  args: {
    input: v.string(),
    topK: v.number(),
    searchId: v.optional(v.id("searches")),
  },
  handler: async (ctx, { input, topK, searchId }) => {
    const {
      embedding,
      totalTokens: inputTokens,
      embeddingMs,
    } = await fetchEmbedding(input);

    const result = await ctx.vectorSearch("chunkEmbedding", "by_embedding", {
      vector: embedding,
      limit: 16,
    });

    if (!result) throw new Error("Pinecone matches are empty");

    const relatedChunks = result.map(({ _id, _score }) => ({
      id: _id as Id<"chunkEmbedding">,
      score: _score,
    }));

    console.log({
      inputTokens,
      embeddingMs,
    });

    if (searchId) {
      await ctx.runMutation(internal.searches.patch, {
        id: searchId,
        patch: {
          relatedChunks,
          // stats
          inputTokens,
          embeddingMs,
        },
      });
    }
    return relatedChunks;
  },
});

export const patch = internalMutation({
  args: { id: v.id("searches"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    return await ctx.db.patch(id, patch);
  },
});

export const paginate = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    return await ctx.db.query("searches").paginate(paginationOpts);
  },
});
