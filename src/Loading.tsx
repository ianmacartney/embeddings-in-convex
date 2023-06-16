import { Progress } from "@rewind-ui/core";

export function Loading() {
  return (
    <Progress animated={true} showValue={false} value={100} striped={true} />
  );
}
