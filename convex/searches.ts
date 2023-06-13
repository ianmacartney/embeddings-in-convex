import { PaginationOptions } from "convex/server";
import { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { crud } from "./lib/crud";

export const { insert, patch, get } = crud("searches");

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
