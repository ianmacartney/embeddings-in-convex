import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { crud } from "./lib/crud";
import { pineconeClient } from "./lib/pinecone";
import { fetchEmbedding } from "./lib/embeddings";

export const { patch, paginate } = crud("searches");

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
      topK: count,
    });
    return searchId;
  }
);

export const search = action(
  async (
    { runMutation },
    {
      input,
      topK,
      searchId,
    }: { input: string; topK: number; searchId?: Id<"searches"> }
  ) => {
    const {
      embedding,
      totalTokens: inputTokens,
      embeddingMs,
    } = await fetchEmbedding(input);
    const pineconeStart = Date.now();
    const pinecone = await pineconeClient();
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
    const pineconeMs = Date.now() - pineconeStart;
    if (searchId) {
      await pinecone.upsert({
        upsertRequest: {
          namespace: "searches",
          vectors: [{ id: searchId, values: embedding, metadata: { input } }],
        },
      });
      const saveSearchMs = Date.now() - pineconeStart - pineconeMs;
      console.log({
        inputTokens,
        embeddingMs,
        pineconeMs,
        saveSearchMs,
      });
      await runMutation(api.searches.patch, {
        id: searchId,
        patch: {
          relatedChunks,
          // stats
          inputTokens,
          embeddingMs,
          pineconeMs,
          saveSearchMs,
        },
      });
    }
    return relatedChunks;
  }
);

export const wordSearch = query(
  async ({ db }, { input, count }: { input: string; count: number }) => {
    const results = await db
      .query("chunks")
      .withSearchIndex("text", (q) => q.search("text", input))
      .take(count);
    return await Promise.all(
      results.map(async (chunk) => {
        const source = await db.get(chunk.sourceId);
        return { ...chunk, sourceName: source!.name };
      })
    );
  }
);

export const semanticSearch = query(
  async ({ db }, { searchId }: { searchId: Id<"searches"> }) => {
    const search = await db.get(searchId);
    if (!search) throw new Error("Unknown search " + searchId);
    if (!search.relatedChunks) return null;
    return await Promise.all(
      search.relatedChunks.map(async ({ id, score }) => {
        const chunk = await db.get(id);
        const source = await db.get(chunk!.sourceId);
        return { ...chunk!, score, sourceName: source!.name };
      })
    );
  }
);
