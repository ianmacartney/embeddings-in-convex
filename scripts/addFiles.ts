import { api } from "../convex/_generated/api.js";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";

const ChunkBatchSize = 100;
const ChunkSize = 1000;

// Recursively processes all files with these extensions in the given dir.
const loader = new DirectoryLoader(process.argv[2] || "../documents", {
  ".txt": (path) => new TextLoader(path),
  ".md": (path) => new TextLoader(path),
  ".pdf": (path) => new PDFLoader(path),
});

// The Convex backend where we're uploading results
const address = process.env.CONVEX_URL;
if (!address) throw new Error("Specify CONVEX_URL env variable");
const client = new ConvexHttpClient(address);

export const uploadDocuments = async () => {
  const start = Date.now();
  const docs = await loader.load();
  let batch: {
    name: string;
    chunks: { text: string; lines: { from: number; to: number } }[];
  }[] = [];
  for (const doc of docs) {
    console.log(`Processing document: ${doc.metadata.source}`);
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: ChunkSize,
    });
    const chunks = await textSplitter.createDocuments([doc.pageContent]);
    // If this doc will put us over the batch limit, let's send it
    if (
      batch.length > 0 &&
      batch.reduce((sum, val) => sum + val.chunks.length, 0) >=
        ChunkBatchSize - chunks.length
    ) {
      console.log("Sending up a batch:", batch.length);
      await client.action(api.sources.addBatch, { batch });
      batch = [];
    }
    batch.push({
      name: path.parse(doc.metadata.source).base,
      chunks: chunks.map((chunk) => ({
        text: chunk.pageContent,
        lines: chunk.metadata.loc.lines,
      })),
    });
  }
  if (batch.length) {
    console.log("Sending up a final batch:", batch.length);
    await client.action(api.sources.addBatch, { batch });
    batch = [];
  }
  console.log("Finished embedding documents. ms:", Date.now() - start);
  return "success";
};

uploadDocuments().then(console.log);
