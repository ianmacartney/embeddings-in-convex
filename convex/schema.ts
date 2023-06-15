import { v } from "convex/values";
import { defineSchema, defineTable } from "convex/server";

export default defineSchema({
  chunks: defineTable({
    // The Pinecone ID is the chunk's _id
    // raw text: ~1k bytes or less
    text: v.string(),
    sourceId: v.id("sources"),
    // Where in a larger document is this text.
    chunkIndex: v.number(),
    lines: v.object({
      from: v.number(),
      to: v.number(),
    }),
  }).searchIndex("text", { searchField: "text" }),
  sources: defineTable({
    name: v.string(),
    // Max 1k chunks (otherwise remove this and use an index on sourceId)
    chunkIds: v.array(v.id("chunks")),
    saved: v.boolean(),
  }),
  searches: defineTable({
    // The Pinecone ID is the searche's _id
    input: v.string(),
    relatedChunks: v.optional(
      v.array(
        v.object({
          id: v.id("chunks"),
          score: v.number(),
        })
      )
    ),
    // stats
    embeddingMs: v.optional(v.number()),
    pineconeMs: v.optional(v.number()),
  }),
});
