import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { fetchEmbedding } from "./lib/embeddings";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { pruneNull } from "./lib/utils";
import { compareTo } from "./lib/vectors";

export const upsert = mutation(
  async (
    { db, scheduler },
    { input, count: countOpt }: { input: string; count?: number }
  ) => {
    const count = countOpt || 10;
    const existing = await db
      .query("searches")
      .withIndex("input", (q) => q.eq("input", input))
      .filter((q) => q.gte(q.field("count"), count))
      .unique();
    if (existing) {
      console.log("Re-using search for", input);
      return existing._id;
    }
    const searchId = await db.insert("searches", { input, count });
    console.log("Starting search for", input);
    await scheduler.runAfter(0, api.searches.search, {
      input,
      searchId,
    });
    return searchId;
  }
);

export const addResults = internalMutation(
  async (
    { db },
    {
      searchId,
      float32Buffer,
      inputTokens,
      embeddingMs,
    }: {
      searchId: Id<"searches">;
      float32Buffer: ArrayBuffer;
      inputTokens: number;
      embeddingMs: number;
    }
  ) => {
    const search = await db.get(searchId);
    if (!search) throw new Error("Search not found");
    const results = await compareTo(db, new Float32Array(float32Buffer));
    const relatedChunks = results.slice(0, search.count);
    await db.patch(searchId, {
      relatedChunks,
      float32Buffer,
      inputTokens,
      embeddingMs,
    });
  }
);

export const search = action(
  async (
    { runMutation },
    { input, searchId }: { input: string; searchId?: Id<"searches"> }
  ) => {
    const {
      embedding,
      totalTokens: inputTokens,
      embeddingMs,
    } = await fetchEmbedding(input);
    if (searchId) {
      console.log({
        inputTokens,
        embeddingMs,
      });
      await runMutation(api.searches.addResults, {
        searchId,
        float32Buffer: Float32Array.from(embedding).buffer,
        inputTokens,
        embeddingMs,
      });
    }
  }
);

export const wordSearch = query(
  async ({ db }, { input, count }: { input: string; count: number }) => {
    const results = await db
      .query("chunks")
      .withSearchIndex("text", (q) => q.search("text", input))
      .take(count);
    return pruneNull(
      await Promise.all(
        results.map(async (chunk) => {
          const source = await db.get(chunk.sourceId);
          return source && { ...chunk, sourceName: source.name };
        })
      )
    );
  }
);

export const semanticSearch = query(
  async ({ db }, { searchId }: { searchId: Id<"searches"> }) => {
    const search = await db.get(searchId);
    if (!search) throw new Error("Unknown search " + searchId);
    if (!search.relatedChunks) return null;
    return pruneNull(
      await Promise.all(
        search.relatedChunks.map(async ({ id, score }) => {
          const chunk = await db.get(id);
          if (!chunk) return null;
          const source = await db.get(chunk.sourceId);
          return { ...chunk, score, sourceName: source!.name };
        })
      )
    );
  }
);

export const patch = internalMutation({
  args: { id: v.id("searches"), patch: v.any() },
  handler: async ({ db }, { id, patch }) => {
    return await db.patch(id, patch);
  },
});

export const paginate = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async ({ db }, { paginationOpts }) => {
    return await db.query("searches").paginate(paginationOpts);
  },
});
