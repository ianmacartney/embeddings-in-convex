import { PineconeClient } from "pinecone-client";
import { action, internalMutation } from "./_generated/server";

function client() {
  return new PineconeClient({
    apiKey: process.env.PINECONE_API_KEY,
    baseUrl: process.env.PINECONE_API_BASE_URL,
  });
}

export const parseDocument = action(
  async (
    { runMutation },
    {
      documentName,
      documentBody,
    }: { documentName: string; documentBody: string }
  ) => {
    const documentId = await runMutation("pinecone:insertDocument", {
      documentBody,
      documentName,
    });
  }
);

export const insertDocument = internalMutation(
  async (
    { db },
    {
      documentName,
      documentBody,
    }: { documentName: string; documentBody: string }
  ) => {
    // return db.insert("documents", { name: documentName, body: documentBody });
  }
);
