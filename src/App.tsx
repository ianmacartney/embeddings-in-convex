import { useState } from "react";
import "./App.css";
import { Doc, Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { useAction, usePaginatedQuery, useQuery } from "convex/react";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

function AddSource() {
  const [newText, setNewText] = useState("");
  const [name, setName] = useState("");
  const createSource = useAction(api.sources.add);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1000,
        });
        textSplitter.createDocuments([newText]).then((docs) => {
          createSource({
            name,
            chunks: docs.map((doc) => ({
              text: doc.pageContent,
              lines: doc.metadata.loc.lines,
            })),
          });
        });
        setName("");
        setNewText("");
      }}
    >
      <input
        type="text"
        name="text"
        onChange={(e) => setNewText(e.target.value)}
        value={newText}
      />
      <input
        type="text"
        name="name"
        onChange={(e) => setName(e.target.value)}
        value={name}
      />
      <button type="submit" disabled={!newText || !name}>
        Add text
      </button>
    </form>
  );
}

function Sources({ sources }: { sources: Doc<"sources">[] }) {
  const chunks =
    useQuery(api.sources.allChunks, {
      ids: sources.map((s) => s.chunkIds[0]),
    }) ?? [];
  return (
    <ul role="list" className="divide-y divide-gray-100">
      {sources.map((source) => (
        <li key={source._id} className="flex gap-x-4 py-5">
          <div className="flex-auto">
            <div className="flex items-baseline justify-between gap-x-4">
              <p className="text-sm font-semibold leading-6 text-gray-900">
                {source.name}
              </p>
              <p className="flex-none text-xs text-gray-600">
                {chunks.find((c) => c._id === source.chunkIds[0])?.text}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AllSources() {
  const {
    status,
    loadMore,
    results: sources,
  } = usePaginatedQuery(api.sources.paginate, {}, { initialNumItems: 10 });
  return (
    <>
      <Sources sources={sources} />
      {status !== "Exhausted" && (
        <button
          onClick={() => loadMore(10)}
          disabled={status !== "CanLoadMore"}
        >
          Load More
        </button>
      )}
    </>
  );
}

function Search({
  setTarget,
}: {
  setTarget: (t: { text: string; searchId: Id<"searches"> }) => void;
}) {
  const [input, setSearch] = useState("");
  const addSearch = useAction(api.searches.add);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        addSearch({
          input,
        }).then((searchId) => setTarget({ text: input, searchId }));
        setSearch("");
      }}
    >
      <input
        type="text"
        name="text"
        onChange={(e) => setSearch(e.target.value)}
        value={input}
      />
      <button type="submit" disabled={!input}>
        Search
      </button>
    </form>
  );
}

function Chunks({
  chunks,
}: {
  chunks: (Doc<"chunks"> & { sourceName: string; score?: number })[];
}) {
  return (
    <ul role="list" className="divide-y divide-gray-100">
      {chunks.map((chunk) => (
        <li key={chunk._id} className="flex gap-x-4 py-5">
          <div className="flex-auto">
            <div className="flex items-baseline justify-between gap-x-4">
              <p className="text-sm font-semibold leading-6 text-gray-900">
                {chunk.sourceName} {chunk.chunkIndex} {chunk.score}
              </p>
              <p className="flex-none text-xs text-gray-600">{chunk.text}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Results({ searchId }: { searchId: Id<"searches"> }) {
  const semantic = useQuery(api.searches.semanticSearch, { searchId }) ?? [];
  const {
    status,
    loadMore,
    results: wordBased,
  } = usePaginatedQuery(
    api.searches.wordSearch,
    { searchId },
    { initialNumItems: 10 }
  );
  return (
    <>
      <h2>Semantic</h2>
      <Chunks chunks={semantic} />
      <h2>Word-Based</h2>
      <Chunks chunks={wordBased} />
      {status !== "Exhausted" && (
        <button
          onClick={() => loadMore(10)}
          disabled={status !== "CanLoadMore"}
        >
          Load More
        </button>
      )}
    </>
  );
}

function App() {
  const [target, setTarget] = useState<{
    searchId: Id<"searches">;
    text: string;
  }>();

  return (
    <>
      <h1>Search</h1>
      <Search setTarget={setTarget} />
      {target && (
        <>
          <h2>Query:</h2>
          <span>{target.text.substring(0, 100)}</span>
          <Results searchId={target.searchId} />
        </>
      )}
      <AddSource />
    </>
  );
}

export default App;
