import { useState } from "react";
import { useAi, type RunState } from "../lib/ai";
import { openExternal } from "../lib/platform";
import { Prose, Smooth, type ProseRef } from "./Prose";

/** Estado de uma resposta: esperando, escrevendo, pedindo a chave ou com erro. */
export function RunOutput({
  state,
  label,
  onRetry,
  resolve,
}: {
  state: RunState;
  /** o que está acontecendo enquanto não chega texto ("resumindo…") */
  label: string;
  onRetry(): void;
  resolve?: (key: string) => ProseRef | undefined;
}) {
  return (
    <Smooth>
      <Body state={state} label={label} onRetry={onRetry} resolve={resolve} />
    </Smooth>
  );
}

function Body({ state, label, onRetry, resolve }: Parameters<typeof RunOutput>[0]) {
  switch (state.status) {
    case "idle":
      return null;
    case "thinking":
      return <Thinking label={label} />;
    case "needs-key":
      return <KeyField onSaved={onRetry} />;
    case "error":
      return (
        <p className="run-error mono">
          {state.message}
          <button onClick={onRetry}>tentar de novo</button>
        </p>
      );
    default:
      return <Prose text={state.text} streaming={state.status === "streaming"} resolve={resolve} />;
  }
}

/** Esperando a primeira palavra: o rótulo brilha como as labaredas do céu. */
export function Thinking({ label }: { label: string }) {
  return (
    <p className="thinking">
      <span className="thinking-stars" aria-hidden>
        <i>✦</i>
        <i>✦</i>
        <i>✦</i>
      </span>
      <span className="thinking-label mono">{label}</span>
    </p>
  );
}

/** Pedido da chave no próprio lugar da resposta, na primeira vez. */
export function KeyField({ onSaved }: { onSaved?: () => void }) {
  const [draft, setDraft] = useState("");
  const setKey = useAi((s) => s.setKey);
  const save = () => {
    if (!draft.trim()) return;
    setKey(draft);
    onSaved?.();
  };

  return (
    <div className="key-field">
      <p>Isto usa a API do Gemini. Cole uma chave; ela fica guardada só neste computador.</p>
      <div className="key-row">
        <input
          className="field"
          type="password"
          autoFocus
          placeholder="Chave da API do Gemini"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <button className="btn" disabled={!draft.trim()} onClick={save}>
          Guardar
        </button>
      </div>
      <button className="key-link mono" onClick={() => openExternal("https://aistudio.google.com/apikey")}>
        criar uma chave no Google AI Studio ↗
      </button>
    </div>
  );
}
