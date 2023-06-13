import { internalMutation } from "./_generated/server";
import { crud } from "./lib/crud";

export const { patch, paginate } = crud("sources");

// Insert the source into the DB, along with the associated chunks.
export const insert = internalMutation(
  async (
    { db },
    {
      name,
      chunks,
    }: {
      name: string;
      chunks: { text: string; lines: { from: number; to: number } }[];
    }
  ) => {
    const sourceId = await db.insert("sources", {
      name,
      chunkIds: [],
      saved: false,
    });
    const chunkIds = await Promise.all(
      chunks.map(({ text, lines }, chunkIndex) =>
        db.insert("chunks", {
          text,
          sourceId,
          chunkIndex,
          lines,
        })
      )
    );
    await db.patch(sourceId, { chunkIds });
    return { sourceId, chunkIds };
  }
);
