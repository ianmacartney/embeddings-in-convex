import { Infer, v } from "convex/values";
import {
  DatabaseWriter,
  internalAction,
  internalMutation,
  mutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { fetchEmbeddingBatch } from "./lib/embeddings";

const InputChunk = v.object({
  text: v.string(),
  lines: v.object({ from: v.number(), to: v.number() }),
});

type InputChunk = Infer<typeof InputChunk>;

async function addSource(
  db: DatabaseWriter,
  name: string,
  chunks: InputChunk[]
) {
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
  return {
    source: (await db.get(sourceId))!,
  }!;
}

/**
 * Add a batch of sources, where each one is a named source with all chunks.
 */
export const addBatch = mutation({
  args: {
    batch: v.array(v.object({ name: v.string(), chunks: v.array(InputChunk) })),
  },
  handler: async (ctx, { batch }) => {
    await ctx.scheduler.runAfter(0, internal.sources.addEmbeddingBatch, {
      batch: await Promise.all(
        batch.map(async ({ name, chunks }) => {
          const { source } = await addSource(ctx.db, name, chunks);
          return {
            source,
            texts: chunks.map(({ text }) => text),
          };
        })
      ),
    });
  },
});

export const addEmbeddingBatch = internalAction(
  async (
    ctx,
    { batch }: { batch: { source: Doc<"sources">; texts: string[] }[] }
  ) => {
    const length = batch.flatMap(({ texts }) => texts.length);

    // Calculate all the embeddings for all sources at once.
    const { embeddings, totalTokens, embeddingMs } = await fetchEmbeddingBatch(
      batch.flatMap(({ texts }) => texts)
    );

    const offsets = batch.reduce(
      (acc, { texts }) => [...acc, acc[acc.length - 1] + texts.length],
      [0]
    );

    console.log("Check Text", offsets);
    await Promise.all(
      batch.map(({ source }, idx) => {
        source.chunkIds.map(async (id, chunkIndex) => {
          await ctx.runMutation(internal.sources.chunkPatch, {
            chunkId: id,
            embeddings: embeddings[offsets[idx] + chunkIndex],
          });
        });
      })
    );

    await Promise.all(
      batch.map(async ({ source }) => {
        await ctx.runMutation(internal.sources.patch, {
          id: source._id,
          patch: {
            saved: true,
          },
        });
      })
    );
  }
);

export const chunkPatch = internalMutation({
  args: { chunkId: v.id("chunks"), embeddings: v.array(v.float64()) },
  handler: async (ctx, { embeddings, chunkId }) => {
    const chunkEmbeddingId = await ctx.db.insert("chunkEmbedding", {
      embedding: embeddings,
    });

    await ctx.db.patch(chunkId, {
      embeddingId: chunkEmbeddingId,
    });
  },
});

export const patch = internalMutation({
  args: { id: v.id("sources"), patch: v.any() },
  handler: async (ctx, { id, patch }) => {
    return await ctx.db.patch(id, patch);
  },
});
