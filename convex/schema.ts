import { v } from "convex/values";
import { defineSchema, defineTable } from "convex/schema";

const document = v.object({ body: v.string(), name: v.string() });
const excerpt = v.object({
  document_id: v.id("documents"),
  text: v.string(),
  index: v.number(),
});

export default defineSchema({
  documents: defineTable(document),
  excerpts: defineTable(excerpt),
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
