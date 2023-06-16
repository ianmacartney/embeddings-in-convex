import { useQuery } from "convex/react";
import { Button, Text } from "@rewind-ui/core";
import { api } from "../convex/_generated/api";
import { Loading } from "./Loading";
import { AllChunks, Chunks } from "./Chunks";
import { Target, CompareFn } from "./useComparison";

export function Compare({
  target,
  compare,
}: {
  target?: Target;
  compare: CompareFn;
}) {
  return (
    <>
      {target ? (
        <ComparisonResults target={target} compare={compare} />
      ) : (
        <AllChunks compare={compare} />
      )}
    </>
  );
}

function ComparisonResults({
  target: { comparisonId, chunkId },
  compare,
}: {
  target: Target;
  compare: CompareFn;
}) {
  const comparison = useQuery(api.comparisons.get, { comparisonId });
  return comparison?.relatedChunks.length ? (
    <>
      <div className="flex">
        <Text className="line-clamp-3">
          Results for {comparison.target.sourceName} (
          {comparison.target.chunkIndex}): "{comparison.target.text}
        </Text>
        <Button onClick={() => compare()} color="red">
          Clear
        </Button>
      </div>
      <Chunks chunks={comparison.relatedChunks} compare={compare} />{" "}
    </>
  ) : (
    <>
      <Text className="line-clamp-3">
        Comparing against "{comparison?.target?.text ?? chunkId}"...
      </Text>
      <Loading />
    </>
  );
}
