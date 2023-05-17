import { PineconeClient } from "pinecone-client";
import { action, internalMutation } from "./_generated/server";
import { Configuration, OpenAIApi } from "openai";

const pinecone = new PineconeClient({
  apiKey: process.env.PINECONE_API_KEY,
  baseUrl: process.env.PINECONE_API_BASE_URL,
});

type Embedding = {
  embedding: number[];
  index: number;
  total_tokens: number;
};

export async function getEmbeddings(texts: string[]) {
  console.log("getting embeddings for ", texts);
  const result = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
    },

    body: JSON.stringify({
      model: "text-embedding-ada-002",
      input: texts,
    }),
  });

  const total_length = texts.reduce((acc, cur) => acc + cur.length, 0);

  console.log(result);
  const jsonresults = await result.json();
  console.log(jsonresults);
  if (jsonresults.data) {
    const total_tokens = jsonresults.usage.total_tokens;
    const allembeddings = jsonresults.data as Embedding[];
    allembeddings.forEach((embedding) => {
      embedding.total_tokens =
        (texts[embedding.index].length / total_length) * total_tokens;
    });
    return allembeddings;
  }
  return [];
}

export const createEmbedding = action(
  async ({ runMutation }, { name, instructions }) => {
    const document = "hi";
    const embedding = await getEmbeddings([document]);

    console.log(embedding.data);
  }
);

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
    return db.insert("documents", { name: documentName, body: documentBody });
  }
);
