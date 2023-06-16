import { useRef, useState } from "react";
import "./App.css";
import { Doc, Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import {
  useMutation,
  usePaginatedQuery,
  useConvex,
  useQuery,
} from "convex/react";
import { Dispatch } from "react";

import { MagnifyingGlass } from "@phosphor-icons/react";
import {
  Alert,
  Accordion,
  Tabs,
  Table,
  Text,
  InputGroup,
  FormControl,
  Card,
} from "@rewind-ui/core";
import { AddSource } from "./AddSource";
import { Loading } from "./Loading";

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

type Target = { text: string; searchId: Id<"searches"> };

function SearchBar({
  setInput,
  setTarget,
}: {
  setInput: Dispatch<string>;
  setTarget: Dispatch<Target>;
}) {
  const addSearch = useMutation(api.searches.upsert);
  const searchRef = useRef<HTMLInputElement>(null);
  return (
    <form
      className="flex"
      onSubmit={(e) => {
        e.preventDefault();
        const input = searchRef.current?.value;
        if (!input) return;
        setInput(input);
        addSearch({
          input,
        }).then((searchId) => setTarget({ text: input, searchId }));
      }}
    >
      <InputGroup>
        <InputGroup.Text>
          <MagnifyingGlass weight="duotone" />
        </InputGroup.Text>
        <InputGroup.Input
          ref={searchRef}
          placeholder={"Search..."}
          type="search"
          withRing={false}
        />
        <InputGroup.Button type="submit" withRing={false}>
          Submit
        </InputGroup.Button>
      </InputGroup>
    </form>
  );
}

function Chunks({
  chunks,
}: {
  chunks: (Doc<"chunks"> & { sourceName: string; score?: number })[];
}) {
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th align="left">Source</Table.Th>
          <Table.Th align="left">Index</Table.Th>
          <Table.Th align="left">Content</Table.Th>
          <Table.Th align="left">Score</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {chunks.map((chunk) => (
          <Table.Tr key={chunk._id}>
            <Table.Td>{chunk.sourceName}</Table.Td>
            <Table.Td>{chunk.chunkIndex}</Table.Td>
            <Table.Td>
              <p className="line-clamp-3">{chunk.text}</p>
            </Table.Td>
            <Table.Td>
              {chunk.score ? `${(chunk.score * 100).toFixed(2)}%` : "-"}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function WordSearch({ input }: { input: string }) {
  const wordBased = useQuery(api.searches.wordSearch, { input, count: 10 });
  return wordBased ? <Chunks chunks={wordBased} /> : <Loading />;
}
function SemanticSearch({ target: { searchId, text } }: { target: Target }) {
  const semantic = useQuery(api.searches.semanticSearch, { searchId });
  return (
    <>
      {semantic ? (
        <>
          <Text>Results for "{text}":</Text>
          <Chunks chunks={semantic} />
        </>
      ) : (
        <>
          <Text>Searching for "{text}"...</Text>
          <Loading />
        </>
      )}
    </>
  );
}

function Search() {
  const [target, setTarget] = useState<Target>();
  const [input, setInput] = useState("");

  return (
    <>
      <SearchBar setInput={setInput} setTarget={setTarget} />
      {target && (
        <Accordion defaultItem="semantic-search">
          <Accordion.Item anchor="semantic-search">
            <Accordion.Header>Semantic</Accordion.Header>
            <Accordion.Body>
              <SemanticSearch target={target} />
            </Accordion.Body>
          </Accordion.Item>
          <Accordion.Item anchor="word-search">
            <Accordion.Header>Word-Based</Accordion.Header>
            <Accordion.Body>
              <WordSearch input={input} />
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
      )}
    </>
  );
}
function App() {
  const embeddingsEnv = useQuery(api.lib.embeddings.envCheck) ?? {};
  const pineconeEnv = useQuery(api.lib.pinecone.envCheck) ?? {};
  const envCheck = { ...embeddingsEnv, ...pineconeEnv };
  const missingEnv = Object.entries(envCheck).reduce<string[]>(
    (badOnes, [key, value]) => (value ? badOnes : [...badOnes, key]),
    []
  );
  if (missingEnv.length) {
    return (
      <Alert color="red">
        You are missing the following Environment Variables:
        <ol>
          {missingEnv.map((missing) => (
            <li key={missing}>{missing}</li>
          ))}
        </ol>
        Please enter them on{" "}
        <a className="text-blue-500" href="https://dashboard.convex.dev">
          the Convex Dashboard
        </a>
        . See{" "}
        <a
          className="text-blue-500"
          href="https://docs.convex.dev/production/environment-variables"
        >
          the docs
        </a>{" "}
        for details.
      </Alert>
    );
  }
  return (
    <>
      <Tabs defaultTab="add-source">
        <Tabs.List>
          <Tabs.Tab anchor="add-source">Add Source</Tabs.Tab>
          <Tabs.Tab anchor="search">Search</Tabs.Tab>
        </Tabs.List>
        <Tabs.Content anchor="add-source">
          <AddSource />
        </Tabs.Content>
        <Tabs.Content anchor="search">
          <Search />
        </Tabs.Content>
        <Tabs.Content anchor="sources">
          <AllSources />
        </Tabs.Content>
      </Tabs>
    </>
  );
}

export default App;
