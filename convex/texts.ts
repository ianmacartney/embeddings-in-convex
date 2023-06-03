import { Id } from "./_generated/dataModel";
import { internalQuery, mutation, query } from "./_generated/server";
import { Text } from "./schema";

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

export const add = mutation(
  async ({ db, scheduler }, { text }: { text: string }) => {
    const textId = await db.insert("texts", { raw: text });
    await scheduler.runAfter(0, "embeddings:create", { textId });
    return textId;
  }
);
