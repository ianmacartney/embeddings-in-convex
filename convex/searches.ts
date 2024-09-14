import { api, internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { fetchEmbedding } from "./lib/embeddings";
import { v } from "convex/values";
import { pruneNull } from "./lib/utils";
import { pick } from "convex-helpers";
import schema from "./schema";
import { crud } from "convex-helpers/server/crud";
import { getOrThrow } from "convex-helpers/server/relationships";

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
    const start = Date.now();
    const relatedChunks = (
      await ctx.vectorSearch("chunkEmbeddings", "vector", {
        vector: embedding,
        limit: topK,
      })
    ).map(({ _id: id, _score: score }) => ({ id, score }));
    const queryMs = Date.now() - start;
    if (searchId) {
      await ctx.runMutation(internal.searches.storeEmbedding, {
        embedding,
        searchId,
        relatedChunks,
        // stats
        inputTokens,
        embeddingMs,
        queryMs,
      });
      const saveSearchMs = Date.now() - start - queryMs;
      console.log({
        inputTokens,
        embeddingMs,
        queryMs,
        saveSearchMs,
      });
    }
  },
});

export const storeEmbedding = internalMutation({
  args: {
    searchId: v.id("searches"),
    embedding: v.array(v.number()),
    ...pick(schema.tables.searches.validator.fields, [
      "inputTokens",
      "embeddingMs",
      "queryMs",
      "relatedChunks",
    ]),
  },
  handler: async (ctx, { searchId, embedding, ...patch }) => {
    const search = await getOrThrow(ctx, searchId);
    if (search.embeddingId) {
      await ctx.db.patch(search.embeddingId, { vector: embedding });
    } else {
      const embeddingId = await ctx.db.insert("searchEmbeddings", {
        vector: embedding,
      });
      await ctx.db.patch(searchId, { embeddingId, ...patch });
    }
  },
});

export const wordSearch = query({
  args: { input: v.string(), count: v.number() },
  handler: async (ctx, { input, count }) => {
    const results = await ctx.db
      .query("chunks")
      .withSearchIndex("text", (q) => q.search("text", input))
      .take(count);
    return Promise.all(
      results.map(async (chunk) => {
        const source = await ctx.db.get(chunk.sourceId);
        if (!source) throw new Error("Missing source for chunk " + chunk._id);
        return { ...chunk, sourceName: source.name };
      })
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
          const chunk = await ctx.db
            .query("chunks")
            .withIndex("embeddingId", (q) => q.eq("embeddingId", id))
            .unique();
          if (!chunk) return null;
          const source = await ctx.db.get(chunk.sourceId);
          return { ...chunk, score, sourceName: source!.name };
        })
      )
    );
  },
});

export const { paginate } = crud(schema, "searches", query);
