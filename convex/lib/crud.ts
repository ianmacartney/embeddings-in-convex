import { PaginationOptions, WithoutSystemFields } from "convex/server";
import { Id, TableNames } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

export function crud<TableName extends TableNames>(tableName: TableName) {
  return {
    insert: mutation(
      async ({ db }, doc: WithoutSystemFields<Doc<TableName>>) => {
        return await db.insert(tableName, doc);
      }
    ),
    insertBatch: mutation(
      async (
        { db },
        { batch }: { batch: WithoutSystemFields<Doc<TableName>>[] }
      ) => {
        return await Promise.all(
          batch.map(async (doc) => db.insert(tableName, doc))
        );
      }
    ),
    get: query(async ({ db }, { id }: { id: Id<TableName> }) => {
      const doc = await db.get(id);
      if (!doc) {
        throw new Error("Document not found: " + id);
      }
      return doc;
    }),
    getAll: query(async ({ db }, { ids }: { ids: Id<TableName>[] }) => {
      return Promise.all(
        ids.map(async (id) => {
          const doc = await db.get(id);
          if (!doc) {
            throw new Error("Document not found: " + id);
          }
          return doc;
        })
      );
    }),
    all: query(async ({ db }) => {
      return await db.query(tableName).collect();
    }),
    take: query(async ({ db }, { count }: { count: number }) => {
      return await db.query(tableName).take(count);
    }),
    paginate: query(
      async (
        { db },
        { paginationOpts }: { paginationOpts: PaginationOptions }
      ) => {
        return await db.query(tableName).paginate(paginationOpts);
      }
    ),
    patch: mutation(
      async (
        { db },
        { id, patch }: { id: Id<TableName>; patch: Partial<Doc<TableName>> }
      ) => {
        return await db.patch(id, patch);
      }
    ),
    delete: mutation(async ({ db }, { id }: { id: Id<TableName> }) => {
      return await db.delete(id);
    }),
  };
}
