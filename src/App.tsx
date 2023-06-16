import "./App.css";

import { Tabs } from "@rewind-ui/core";
import { AddSource } from "./AddSource";
import { EnvCheck } from "./EnvCheck";
import { Sources } from "./Sources";
import { Search } from "./Search";
import { Compare } from "./Compare";
import { useComparison } from "./useComparison";
import { useEffect, useRef, useState } from "react";

function App() {
  const [target, compare] = useComparison();
  return (
    <EnvCheck>
      <Tabs defaultTab="add-source">
        <Tabs.List>
          <Tabs.Tab anchor="add-source">Add Source</Tabs.Tab>
          <Tabs.Tab anchor="search">Search</Tabs.Tab>
          <Tabs.Tab id="compare" anchor="compare">
            Compare
          </Tabs.Tab>
          <Tabs.Tab anchor="sources">Sources</Tabs.Tab>
        </Tabs.List>
        <Tabs.Content anchor="add-source">
          <AddSource />
        </Tabs.Content>
        <Tabs.Content anchor="search">
          <Search compare={compare} />
        </Tabs.Content>
        <Tabs.Content anchor="compare">
          <Compare target={target} compare={compare} />
        </Tabs.Content>
        <Tabs.Content anchor="sources">
          <Sources />
        </Tabs.Content>
      </Tabs>
    </EnvCheck>
  );
}

export default App;
