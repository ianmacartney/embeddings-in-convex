import { v } from "convex/values";
import { defineSchema, defineTable } from "convex/schema";

export default defineSchema({
  texts: defineTable({
    // raw text - should be < 1M.
    raw: v.string(),
  }),
  vectors: defineTable({
    float32Buffer: v.bytes(),
    textId: v.id("texts"),
  }),
  embeddingStats: defineTable({
    vectorId: v.id("vectors"),
    numTexts: v.number(),
    totalTokens: v.number(),
    totalLength: v.number(),
    elapsedMs: v.number(),
  }),
});
