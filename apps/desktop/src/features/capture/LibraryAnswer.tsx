import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ProseRef } from "../../components/Prose";
import { RunOutput } from "../../components/RunOutput";
import { askLibrary, useAiRun, type LibraryRef } from "../../lib/ai";
import { library } from "../../lib/store";
import { useUi } from "../../lib/ui";

/** Resposta a uma pergunta feita pela busca, com os itens citados clicáveis. */
export function LibraryAnswer({ question }: { question: string }) {
  const { state, run, retry } = useAiRun();
  const refs = useRef(new Map<string, LibraryRef>());
  const set = useUi((s) => s.set);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    void run((onText, signal) => askLibrary(question, (r) => (refs.current = r), onText, signal));
  }, [question, run]);

  const resolve = useCallback(
    (key: string): ProseRef | undefined => {
      const ref = refs.current.get(key);
      const lib = library.getState();
      if (ref?.type === "capture") {
        const c = lib.captures.find((x) => x.id === ref.id);
        return c && { label: c.title, hue: c.hue, open: () => set({ openCaptureId: c.id }) };
      }
      if (ref?.type === "creation") {
        const c = lib.creations.find((x) => x.id === ref.id);
        return c && { label: c.title, hue: c.hue, open: () => set({ openCreationId: c.id }) };
      }
      if (ref?.type === "project") {
        const p = lib.projects.find((x) => x.id === ref.id);
        return p && { label: p.name, hue: p.hue, open: () => set({ section: "projects", activeProjectId: p.id }) };
      }
    },
    [set],
  );

  return (
    <section
      className="answer-panel"
      data-closing={closing || undefined}
      onAnimationEnd={(e) => closing && e.target === e.currentTarget && set({ libraryQuestion: null })}
    >
      <button className="icon-btn answer-close" onClick={() => setClosing(true)} title="Fechar">
        <X size={15} />
      </button>
      <h2 className="answer-question">{question}</h2>
      <RunOutput state={state} label="percorrendo o acervo" onRetry={retry} resolve={resolve} />
    </section>
  );
}
