import { Button, Table } from "@rewind-ui/core";
import { Doc } from "../convex/_generated/dataModel";
import { usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { CompareFn } from "./useComparison";

export function Chunks({
  chunks,
  compare,
}: {
  chunks: (Doc<"chunks"> & { sourceName: string; score?: number })[];
  compare?: CompareFn;
}) {
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th align="left">Source</Table.Th>
          <Table.Th align="left">Index</Table.Th>
          <Table.Th align="left">Content</Table.Th>
          <Table.Th align="left">Score</Table.Th>
          {compare && <Table.Th align="left">Compare</Table.Th>}
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
            {compare && (
              <Table.Td>
                <Button color="blue" onClick={() => compare(chunk._id)}>
                  Compare
                </Button>
              </Table.Td>
            )}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export function AllChunks({ compare }: { compare: CompareFn }) {
  const {
    status,
    loadMore,
    results: chunks,
  } = usePaginatedQuery(
    api.sources.paginateChunks,
    {},
    { initialNumItems: 10 }
  );
  return (
    <>
      <Chunks chunks={chunks} compare={compare} />
      {status !== "Exhausted" && (
        <Button
          onClick={() => loadMore(10)}
          disabled={status !== "CanLoadMore"}
        >
          Load More
        </Button>
      )}
    </>
  );
}
