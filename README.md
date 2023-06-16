# Embeddings Playground with Pinecone, OpenAI, and Convex

An example of working with embeddings and vector databases in Convex.

[Embeddings](https://stack.convex.dev/the-magic-of-embeddings) enable all sorts
of use cases, but it's hard to know how they'll perform on comparisons and
queries without playing around with them.

This project allows you to add source data, generate embeddings via OpenAI,
compare them to each other, and compare semantic and word searches over them.

You can then use the queried source data to include in a ChatGPT prompt (WIP).

UI:
- React
- Tailwindcss
- Rewind-UI
- Vite

Backend:
- Pinecone for storing and querying vector embeddings.
- OpenAI API for creating vector embeddings.
- Convex for storing application data and running server-side functions.

## Setup

### Prerequisites:

1. A Convex backend: you can get a free one at https://convex.dev - and running
  `yarn convex dev` will walk you through creating the backend.
  By making this first, you can enter environment variables for (2) and (3) on
  the [dashboard](https://dashboard.convex.dev).

2. A [Pinecone](https://app.pinecone.io/) API Key and Index. Free to start.
  The only important configuration is to set the vector length to 1536
  Environment variables:
    - `PINECONE_INDEX_NAME` (for me, `embeddings-playground`)
	- `PINECONE_ENVIRONMENT` (for me, `asia-southeast1-gcp-free`)
    - `PINECONE_API_KEY` (a uuid, don't share this publicly)

3. An [OpenAI](https://platform.openai.com/) API key.
  Environment variable: `OPEN_API_KEY` (should start with `sk-`).

### Install:

Run `yarn` (or your package manager of choice)

## Run:

In two separate terminals:

```bash
	# Creates the Convex backend and syncs functions on save.
	$ npx convex dev

	# Runs the frontend using Vite.
	$ vite
```
