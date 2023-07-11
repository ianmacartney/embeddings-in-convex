import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { pineconeIndex, upsertVectors } from "./lib/pinecone";
import { fetchEmbedding } from "./lib/embeddings";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { pruneNull } from "./lib/utils";

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
    const pineconeStart = Date.now();
    const pinecone = await pineconeIndex();
    const { matches } = await pinecone.query({
      queryRequest: {
        namespace: "chunks",
        topK,
        vector: embedding,
      },
    });
    if (!matches) throw new Error("Pinecone matches are empty");
    const relatedChunks = matches.map(({ id, score }) => ({
      id: id as Id<"chunks">,
      score,
    }));
    const queryMs = Date.now() - pineconeStart;
    if (searchId) {
      await upsertVectors(
        "searches",
        [{ id: searchId, values: embedding, metadata: { input } }],
        pinecone
      );
      const saveSearchMs = Date.now() - pineconeStart - queryMs;
      console.log({
        inputTokens,
        embeddingMs,
        queryMs,
        saveSearchMs,
      });
      await ctx.runMutation(internal.searches.patch, {
        id: searchId,
        patch: {
          relatedChunks,
          // stats
          inputTokens,
          embeddingMs,
          queryMs,
          saveSearchMs,
        },
      });
    }
    return relatedChunks;
  },
});

export const wordSearch = query({
  args: { input: v.string(), count: v.number() },
  handler: async (ctx, { input, count }) => {
    const results = await ctx.db
      .query("chunks")
      .withSearchIndex("text", (q) => q.search("text", input))
      .take(count);
    return pruneNull(
      await Promise.all(
        results.map(async (chunk) => {
          const source = await ctx.db.get(chunk.sourceId);
          return source && { ...chunk, sourceName: source.name };
        })
      )
    );
  },
});

export const semanticSearch = query({
  args: { searchId: v.id("searches") },
  handler: async (ctx, { searchId }) => {
    const search = await ctx.db.get(searchId);
    if (!search) throw new Error("Unknown search " + searchId);
    if (!search.relatedChunks) return null;
    return pruneNull(
      await Promise.all(
        search.relatedChunks.map(async ({ id, score }) => {
          const chunk = await ctx.db.get(id);
          if (!chunk) return null;
          const source = await ctx.db.get(chunk.sourceId);
          return { ...chunk, score, sourceName: source!.name };
        })
      )
    );
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
