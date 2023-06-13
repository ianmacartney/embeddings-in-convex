export async function fetchEmbeddingBatch(texts: string[]) {
  const start = Date.now();
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
  const elapsedMs = Date.now() - start;

  const jsonresults = await result.json();
  if (jsonresults.data.length !== texts.length) {
    console.error(result);
    throw new Error("Unexpected number of embeddings");
  }
  const allembeddings = jsonresults.data as {
    embedding: number[];
    index: number;
  }[];
  allembeddings.sort((a, b) => b.index - a.index);
  console.log({
    batchSize: texts.length,
    totalTokens: jsonresults.usage.total_tokens,
    totalLength: texts.reduce((acc, cur) => acc + cur.length, 0),
    elapsedMs,
  });
  return allembeddings.map(({ embedding }) => embedding);
}

export async function fetchEmbedding(text: string) {
  const embeddings = await fetchEmbeddingBatch([text]);
  return embeddings[0];
}
