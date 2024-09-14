import { ReactNode } from "react";
import { useQuery } from "convex/react";
import { Alert } from "@rewind-ui/core";
import { api } from "../convex/_generated/api";

export function EnvCheck({ children }: { children: ReactNode }) {
  const embeddingsEnv = useQuery(api.lib.embeddings.envCheck) ?? {};
  const envCheck = { ...embeddingsEnv };
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
  return <>{children}</>;
}
