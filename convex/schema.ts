import { Infer, v } from "convex/values";
import { defineSchema, defineTable } from "convex/schema";

const text = v.object({
  // raw text - should be < 1M.
  inline: v.string(),

  // sourceId: v.id("sources"),
  // // Where in a larger document is this text.
  // chunkIndex: v.optional(v.number()),
});
export type Text = Infer<typeof text>;

// const source = v.object({
//   name: v.string(),
//   chunks: v.array(v.id("text")),
// });

// const embedding = v.object({});

export default defineSchema({
  // sources: defineTable(source),
  // questions: defineTable({
  // textId: v.id("texts"),
  // }),
  texts: defineTable(text),
  embeddings: defineTable({
    vector: v.bytes(),
  }),
  embeddingStats: defineTable({
    embeddingId: v.id("embeddings"),
    numTexts: v.number(),
    totalTokens: v.number(),
    totalLength: v.number(),
    elapsedMs: v.number(),
  }),
});

// const llmMessage = v.object({
//     a:v.optional(v.string()),
//     u:v.optional(v.string()),
//     s:v.optional(v.string()),
//     name:v.optional(v.string()),
//   })

// const llmChatRequest = v.object({
//     promptMessages : v.array(llmMessage),
//     systemPrompt: v.optional(v.string()),
//     model: v.optional(v.string()),
//     max_tokens: v.optional(v.number()),
//   })
