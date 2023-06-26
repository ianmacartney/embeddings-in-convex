import "./App.css";

import { Tabs, Text } from "@rewind-ui/core";
import { AddSource } from "./AddSource";
import { EnvCheck } from "./EnvCheck";
import { Sources } from "./Sources";
import { Search } from "./Search";
import { Compare } from "./Compare";
import { useComparison } from "./useComparison";
import { Prompt } from "./Prompt";
import { useRef } from "react";

function App() {
  const compareRef = useRef<HTMLButtonElement>(null);
  console.log(compareRef);
  const [target, compare] = useComparison(compareRef);
  return (
    <EnvCheck>
      <Tabs defaultTab="sources">
        <Tabs.List>
          <Tabs.Tab anchor="sources">Sources</Tabs.Tab>
          <Tabs.Tab anchor="search">Search</Tabs.Tab>
          <Tabs.Tab ref={compareRef} anchor="compare">
            Compare
          </Tabs.Tab>
          <Tabs.Tab id="prompt" anchor="prompt">
            Prompt
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Content anchor="search">
          <Search compare={compare} />
        </Tabs.Content>
        <Tabs.Content anchor="prompt">
          <Prompt />
        </Tabs.Content>
        <Tabs.Content anchor="compare">
          <Compare target={target} compare={compare} />
        </Tabs.Content>
        <Tabs.Content anchor="sources">
          <Text size="lg">Add a source</Text>
          <p>
            This is the data you will be able to search over and compare
            semantically.
          </p>
          <AddSource />
          <Sources />
        </Tabs.Content>
      </Tabs>
    </EnvCheck>
  );
}

export default App;
