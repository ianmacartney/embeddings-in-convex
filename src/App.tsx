import { useMemo, useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import { Doc, Id } from "../convex/_generated/dataModel";
import { useMutation, useQuery } from "../convex/_generated/react";

function App() {
  const [target, setTarget] = useState<{
    vectorId: Id<"vectors">;
    text: string;
  }>();
  const texts = useQuery("texts:all") ?? [];
  const [newText, setNewText] = useState("");
  const addText = useMutation("texts:add");
  const scores = useQuery("embeddings:compareTo", {
    vectorId: target?.vectorId,
  });
  const textById = (id: Id<"texts">) => texts.find((t) => t._id.equals(id));
  const scored = scores
    ? scores.map(({ textId, score, vectorId }) => ({
        score,
        vectorId,
        text: textById(textId)!.raw,
      }))
    : [];

  return (
    <>
      <h1>Semantic Comparison</h1>
      {target && (
        <>
          <h2>Looking for:</h2>
          <span>{target.text.substring(0, 100)}</span>
          <h2>Results</h2>
        </>
      )}
      <div>
        <ol>
          {scored.map(({ score, text, vectorId }) => (
            <li key={text}>
              {score && score.toFixed(3)}
              <span>{text}</span>
              <button onClick={() => setTarget({ text, vectorId })}>
                Compare to this
              </button>
            </li>
          ))}
        </ol>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addText({
            text: newText,
          });
          setNewText("");
        }}
      >
        <input
          type="text"
          name="text"
          onChange={(e) => setNewText(e.target.value)}
          value={newText}
        />
        <button type="submit" disabled={!newText}>
          Add text
        </button>
      </form>
    </>
  );
}

export default App;
