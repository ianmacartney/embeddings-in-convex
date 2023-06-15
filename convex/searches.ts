import { PaginationOptions } from "convex/server";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { action, internalMutation, query } from "./_generated/server";
import { crud } from "./lib/crud";
import { pineconeClient } from "./lib/pinecone";
import { fetchEmbedding } from "./lib/embeddings";

export const { patch, get } = crud("searches");

export const upsert = internalMutation(
  async ({ db }, { input }: { input: string }) => {
    const existing = await db
      .query("searches")
      .withIndex("input", (q) => q.eq("input", input))
      .unique();
    if (existing) return [existing._id, false] as const;
    return [await db.insert("searches", { input }), true] as const;
  }
);

export const search = action(
  async (
    { runMutation },
    { input, count }: { input: string; count?: number }
  ): Promise<Id<"searches">> => {
    const [searchId, added] = await runMutation(api.searches.upsert, { input });
    if (!added) return searchId;
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
        topK: count || 10,
        vector: embedding,
      },
    });
    if (!matches) throw new Error("Pinecone matches are empty");
    const pineconeMs = Date.now() - pineconeStart;
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
        relatedChunks: matches.map(({ id, score }) => ({
          id: id as Id<"chunks">,
          score,
        })),
        // stats
        inputTokens,
        embeddingMs,
        pineconeMs,
        saveSearchMs,
      },
    });
    return searchId;
  }
);

export const wordSearch = query(
  async (
    { db },
    {
      searchId,
      paginationOpts,
    }: { searchId: Id<"searches">; paginationOpts: PaginationOptions }
  ) => {
    const search = await db.get(searchId);
    if (!search) throw new Error("Unknown search");
    const results = await db
      .query("chunks")
      .withSearchIndex("text", (q) => q.search("text", search.input))
      .paginate(paginationOpts);
    return {
      ...results,
      page: await Promise.all(
        results.page.map(async (chunk) => {
          const source = await db.get(chunk.sourceId);
          return { ...chunk, sourceName: source!.name };
        })
      ),
    };
  }
);

export const semanticSearch = query(
  async ({ db }, { searchId }: { searchId: Id<"searches"> }) => {
    const search = await db.get(searchId);
    if (!search) throw new Error("Unknown search");
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
