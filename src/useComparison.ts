import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

export function useComparison() {
  const [target, setTarget] = useState<Target>();
  const upsertComparison = useMutation(api.comparisons.upsert);
  const compare = useCallback(
    (chunkId?: Id<"chunks">) => {
      if (chunkId) {
        upsertComparison({ target: chunkId, count: 10 }).then((id) =>
          setTarget({ chunkId, comparisonId: id })
        );
        // console.log(compareRef.current);
        // compareRef.current?.click();
        document.getElementById("compare")?.click();
      } else {
        setTarget(undefined);
      }
    },
    [upsertComparison]
  );

  return [target, compare] as const;
}
export type Target = { chunkId: Id<"chunks">; comparisonId: Id<"comparisons"> };
export type CompareFn = (id?: Id<"chunks">) => void;
