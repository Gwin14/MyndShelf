import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/newsreader/wght.css";
import "@fontsource-variable/newsreader/wght-italic.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "@myndshelf/design-tokens/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/capture.css";
import "./styles/covers.css";
import "./styles/shelf.css";
import "./styles/projects.css";
import "./styles/viewer.css";
import "./styles/feeds.css";
import "./styles/dropzone.css";
import "./styles/contextmenu.css";
import "./styles/answers.css";

const root = createRoot(document.getElementById("root")!);

// a mesma página serve duas janelas: o app e a caixa da bandeja do sistema
if (location.hash === "#dropzone") {
  document.documentElement.classList.add("is-dropzone");
  // a caixa não toca no armazenamento — só repassa para a janela principal
  void import("./features/dropzone/Dropzone").then(({ Dropzone }) =>
    root.render(
      <StrictMode>
        <Dropzone />
      </StrictMode>,
    ),
  );
} else {
  void Promise.all([import("./App"), import("./lib/feeds"), import("./lib/migrate"), import("./lib/seed")]).then(
    ([{ App }, { startFeedSync }, { migrate }, { seedOnce }]) => {
      void seedOnce();
      void migrate();
      startFeedSync();
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
    },
  );
}
