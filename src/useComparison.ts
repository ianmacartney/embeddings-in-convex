import { useMutation } from "convex/react";
import { RefObject, useCallback, useState } from "react";
import { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

export function useComparison(ref: RefObject<HTMLButtonElement>) {
  const [target, setTarget] = useState<Target>();
  const upsertComparison = useMutation(api.comparisons.upsert);
  const compare = useCallback(
    (chunkId?: Id<"chunks">) => {
      if (chunkId) {
        upsertComparison({ target: chunkId, count: 10 }).then((id) =>
          setTarget({ chunkId, comparisonId: id })
        );
        ref.current?.click();
      } else {
        setTarget(undefined);
      }
    },
    [upsertComparison, ref]
  );

  return [target, compare] as const;
}
export type Target = { chunkId: Id<"chunks">; comparisonId: Id<"comparisons"> };
export type CompareFn = (id?: Id<"chunks">) => void;
