import "./App.css";
import Langfuse from "langfuse";
import { useEffect, useState } from "react";

const langfuse = new Langfuse("pk-lf-1234567890", "sk-lf-1234567890", {
  host: "http://localhost:3000",
  flushAt: 1,
});

function App() {
  const [traceId, setTraceId] = useState("");

  useEffect(() => {
    const id = crypto.randomUUID();
    setTraceId(id);
    langfuse.trace({
      id,
    });
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <p>This is an example app for testing the langfuse lib</p>
        <button
          className="Button"
          onClick={() =>
            langfuse.score({
              name: "test",
              value: 1,
              traceId,
            })
          }
        >
          Create score
        </button>
      </header>
    </div>
  );
}

export default App;
