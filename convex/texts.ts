import { StorageActionWriter } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  httpAction,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { Text } from "./schema";
import { compare, compareBuffers, getEmbedding } from "./embeddings";

export const get = internalQuery(
  async ({ db }, { textId }: { textId: Id<"texts"> }) => {
    const textDoc = await db.get(textId);
    if (!textDoc) {
      throw new Error("Text not found");
    }
    return textDoc;
  }
);

export const compareTo = query(
  async ({ db }, { textId }: { textId: Id<"texts"> }) => {
    const textDoc = await db.get(textId);
    if (!textDoc) {
      throw new Error("Text not found");
    }
    const targetEmbedding = await getEmbedding(db, textDoc.embeddingId!);
    const texts = await db.query("texts").collect();
    const scores = await Promise.all(
      texts
        .filter((text) => !!text.embeddingId)
        .map(async (text) => {
          const embedding = await getEmbedding(db, text.embeddingId!);
          const score = compare(embedding, targetEmbedding);
          return { score, textId: text._id, text: text.inline };
        })
    );
    return scores.sort((a, b) => b.score - a.score);
  }
);

export const create = mutation(async ({ db, scheduler }, text: Text) => {
  const textId = await db.insert("texts", text);
  await scheduler.runAfter(0, "embeddings:create", { textId });
  return textId;
});
