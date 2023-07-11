// import {
//   useAction,
//   useMutation,
//   usePaginatedQuery,
//   useQuery,
// } from "convex/react";
import {
  Accordion,
  // Button, Table, Text, InputGroup
} from "@rewind-ui/core";
// import { Id } from "../convex/_generated/dataModel";
// import { api } from "../convex/_generated/api";
// import { Loading } from "./Loading";
// import { Chunks } from "./Chunks";
export function Prompt() {
  return (
    <>
      <Accordion>
        <Accordion.Item anchor="prompt">
          <Accordion.Header>Prompt</Accordion.Header>
          <Accordion.Body></Accordion.Body>
        </Accordion.Item>
        <Accordion.Item anchor="sources">
          <Accordion.Header>Sources</Accordion.Header>
          <Accordion.Body></Accordion.Body>
        </Accordion.Item>
        <Accordion.Item anchor="template">
          <Accordion.Header>Template</Accordion.Header>
          <Accordion.Body></Accordion.Body>
        </Accordion.Item>
        <Accordion.Item anchor="history">
          <Accordion.Header>History</Accordion.Header>
          <Accordion.Body></Accordion.Body>
        </Accordion.Item>
      </Accordion>
    </>
  );
}
