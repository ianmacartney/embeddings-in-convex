import { PineconeClient } from "@pinecone-database/pinecone";
import { query } from "../_generated/server";

function orThrow(env: string | undefined): string {
  if (!env) throw new Error("Missing Environment Variable");
  return env;
}

export async function pineconeClient() {
  const client = new PineconeClient();
  await client.init({
    apiKey: orThrow(process.env.PINECONE_API_KEY),
    environment: orThrow(process.env.PINECONE_ENVIRONMENT),
  });
  return client.Index(orThrow(process.env.PINECONE_INDEX_NAME));
}

export const envCheck = query(async () => {
  return {
    PINECONE_API_KEY: !!process.env.PINECONE_API_KEY,
    PINECONE_ENVIRONMENT: !!process.env.PINECONE_ENVIRONMENT,
    PINECONE_INDEX_NAME: !!process.env.PINECONE_INDEX_NAME,
  };
});
