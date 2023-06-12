import { Id } from "./_generated/dataModel";
import { internalQuery, query } from "./_generated/server";

export const get = internalQuery(
  async ({ db }, { textId }: { textId: Id<"texts"> }) => {
    const textDoc = await db.get(textId);
    if (!textDoc) {
      throw new Error("Text not found");
    }
    return textDoc;
  }
);

export const all = query(async ({ db }) => {
  return await db.query("texts").collect();
});
