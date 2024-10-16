import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { useRef, useState } from "react";
import { Dispatch } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Accordion, Button, Table, Text, InputGroup } from "@rewind-ui/core";
import { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { Loading } from "./Loading";
import { Chunks } from "./Chunks";
import { CompareFn } from "./useComparison";

type Target = { text: string; searchId: Id<"searches"> };

export function Search({ compare }: { compare?: CompareFn }) {
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
              <SemanticSearch target={target} compare={compare} />
            </Accordion.Body>
          </Accordion.Item>
          <Accordion.Item anchor="word-search">
            <Accordion.Header>Word-Based</Accordion.Header>
            <Accordion.Body>
              <WordSearch input={input} compare={compare} />
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
      )}
      <Text size="lg">Search History</Text>
      <PreviousSearches
        reuseSearch={(target) => {
          setTarget(target);
          setInput(target.text);
        }}
      />
    </>
  );
}

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
      <InputGroup className="w-full">
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

function WordSearch({
  input,
  compare,
}: {
  input: string;
  compare?: CompareFn;
}) {
  const wordBased = useQuery(api.searches.wordSearch, { input, count: 10 });
  return wordBased ? (
    <>
      <Text>Results for "{input}":</Text>
      <Chunks chunks={wordBased} compare={compare} />
    </>
  ) : (
    <>
      <Text>Searching for "{input}"...</Text>
      <Loading />
    </>
  );
}

function SemanticSearch({
  target: { searchId, text },
  compare,
}: {
  target: Target;
  compare?: CompareFn;
}) {
  const semantic = useQuery(api.searches.semanticSearch, { searchId });
  return (
    <>
      {semantic ? (
        <>
          <Text>Results for "{text}":</Text>
          <Chunks chunks={semantic} compare={compare} />
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

export type UseSearchFn = (target: Target) => void;

export function PreviousSearches({
  reuseSearch,
}: {
  reuseSearch: UseSearchFn;
}) {
  const { status, loadMore, results } = usePaginatedQuery(
    api.searches.paginate,
    {},
    { initialNumItems: 10 },
  );
  const search = useAction(api.searches.search);
  return (
    <>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th align="left">Input</Table.Th>
            <Table.Th align="left">Tokens</Table.Th>
            <Table.Th align="left">Results</Table.Th>
            <Table.Th align="left">Embedding</Table.Th>
            <Table.Th align="left">Search</Table.Th>
            <Table.Th align="left"></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {results.map((result) => (
            <Table.Tr key={result._id}>
              <Table.Td>{result.input}</Table.Td>
              <Table.Td>{result.inputTokens}</Table.Td>
              <Table.Td>
                {result.relatedChunks?.length || result.count}
              </Table.Td>
              <Table.Td>{result.embeddingMs?.toFixed(0) + " ms"}</Table.Td>
              <Table.Td>{result.queryMs?.toFixed(0) + " ms"}</Table.Td>
              <Table.Td>
                <Button
                  onClick={() =>
                    reuseSearch({ text: result.input, searchId: result._id })
                  }
                  color="green"
                >
                  Re-use
                </Button>
                <span className="mx-1"></span>
                <Button
                  onClick={() =>
                    search({
                      input: result.input,
                      topK: result.count,
                      searchId: result._id,
                    }).then(() =>
                      reuseSearch({ text: result.input, searchId: result._id }),
                    )
                  }
                  color="red"
                >
                  Re-run
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

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
