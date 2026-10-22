import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/inter-tight";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "@myndshelf/design-tokens/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/capture.css";
import "./styles/covers.css";
import "./styles/shelf.css";
import "./styles/projects.css";
import { App } from "./App";
import { seedOnce } from "./lib/seed";

void seedOnce();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
