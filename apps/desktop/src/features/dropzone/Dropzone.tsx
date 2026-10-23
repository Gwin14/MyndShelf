import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AlertTriangle, ArrowUpRight, Library, Sparkles } from "lucide-react";
import { isTauri } from "../../lib/platform";
import type { QuickDropResult } from "../../lib/quickDrop";

type Entry = { id: string; status: "sending" | "done"; label: string; items: QuickDropResult["items"] };

/** duração da animação de saída (igual ao CSS de .dz[data-phase="closing"]) */
const CLOSE_MS = 170;
/** um clique dura menos que isso; segurar mais é arrastar */
const CLICK_MS = 350;

/**
 * Caixa da bandeja do sistema: solte arquivos/pastas (→ Estante) ou links/texto
 * (→ Captura). Ela só repassa para a janela principal, que guarda de verdade —
 * assim as duas janelas nunca brigam pelo mesmo armazenamento.
 */
export function Dropzone() {
  const [over, setOver] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const overRef = useRef(false);
  overRef.current = over;
  // a janela nasce escondida; cada abertura pela bandeja dispara a entrada animada
  const [phase, setPhase] = useState<"hidden" | "open" | "closing">(isTauri ? "hidden" : "open");
  const [above, setAbove] = useState(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  /** anima a saída e só então esconde a janela */
  const hide = () => {
    if (phaseRef.current !== "open") return;
    setPhase("closing");
    window.setTimeout(() => {
      void invoke("hide_dropzone");
      setPhase("hidden");
    }, CLOSE_MS);
  };
  const hideRef = useRef(hide);
  hideRef.current = hide;

  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWebviewWindow();
    const stops = [
      win.listen<boolean>("dropzone-open", ({ payload }) => {
        setAbove(payload);
        setPhase("open");
      }),
      win.listen("dropzone-close", () => hideRef.current()),
    ];
    // garantia: se o evento de abertura se perder, ganhar foco já mostra o painel
    const onFocus = () => phaseRef.current === "hidden" && setPhase("open");
    window.addEventListener("focus", onFocus);
    stops.push(Promise.resolve(() => window.removeEventListener("focus", onFocus)));
    return () => stops.forEach((p) => void p.then((u) => u()));
  }, []);

  const send = (payload: { paths?: string[]; text?: string }, label: string) => {
    const id = crypto.randomUUID();
    setEntries((e) => [{ id, status: "sending" as const, label, items: [] }, ...e].slice(0, 6));
    void emitTo("main", "quick-drop", { id, ...payload });
  };

  // arquivos/pastas (caminhos reais) e links/texto (lidos pelo Rust da área de arrasto)
  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWebviewWindow();
    const stops: Promise<() => void>[] = [
      getCurrentWebview().onDragDropEvent(({ payload }) => {
        if (payload.type === "enter" || payload.type === "over") setOver(true);
        else if (payload.type === "leave") setOver(false);
        else {
          setOver(false);
          if (payload.paths.length) {
            const n = payload.paths.length;
            send({ paths: payload.paths }, n === 1 ? payload.paths[0].split(/[\\/]/).pop()! : `${n} itens`);
          }
        }
      }),
      win.listen<string>("drop-text", ({ payload }) => send({ text: payload }, payload.split("\n")[0])),
      win.listen<QuickDropResult>("quick-drop-done", ({ payload }) =>
        setEntries((e) => e.map((x) => (x.id === payload.id ? { ...x, status: "done", items: payload.items } : x))),
      ),
    ];
    return () => stops.forEach((p) => void p.then((u) => u()));
  }, []);

  // some ao clicar fora — mas não quando a pessoa está segurando (arrastando algo até aqui)
  useEffect(() => {
    if (!isTauri) return;
    let timer: number | undefined;
    let pressedAt: number | null = null;

    const watch = () => {
      pressedAt = null;
      timer = window.setInterval(async () => {
        const pressed = await invoke<boolean>("mouse_pressed");
        if (pressed && pressedAt == null) pressedAt = performance.now();
        if (!pressed && pressedAt != null) {
          const held = performance.now() - pressedAt;
          pressedAt = null;
          if (held < CLICK_MS && !overRef.current) hideRef.current();
        }
      }, 50);
    };
    const unwatch = () => window.clearInterval(timer);
    // ao perder o foco, observa o botão do mouse: clique curto fora fecha, segurar não
    const onBlur = () => {
      unwatch();
      watch();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hideRef.current();

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", unwatch);
    window.addEventListener("keydown", onKey);
    return () => {
      unwatch();
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", unwatch);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const openApp = async () => {
    const main = await WebviewWindow.getByLabel("main");
    await main?.show();
    await main?.unminimize();
    await main?.setFocus();
    hide();
  };

  return (
    <div className="dz" data-phase={phase} data-above={above || undefined}>
      <div className="dz-panel">
        <div className="dz-target" data-over={over || undefined}>
          <span className="dz-orbit" />
          <p className="dz-title">{over ? "Pode soltar ✦" : "Solte aqui"}</p>
          <p className="dz-sub mono">
            <span>
              <Library size={11} /> arquivos e pastas → Estante
            </span>
            <span>
              <Sparkles size={11} /> links e textos → Captura
            </span>
          </p>
        </div>

        {entries.length > 0 && (
          <ul className="dz-list">
            {entries.map((e) => (
              <li key={e.id} data-status={e.status}>
                {e.status === "sending" ? (
                  <span className="dz-spin" />
                ) : e.items.some((i) => i.where === "erro") ? (
                  <AlertTriangle size={12} className="dz-err" />
                ) : (
                  <span className="dz-ok">✦</span>
                )}
                <span className="dz-name">{e.label}</span>
                <span className="dz-where mono">
                  {e.status === "sending"
                    ? "enviando"
                    : [...new Set(e.items.map((i) => i.where))].map((w) => (w === "erro" ? "falhou" : w)).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}

        <button className="dz-open mono" onClick={openApp}>
          abrir o MyndShelf <ArrowUpRight size={11} />
        </button>
      </div>
    </div>
  );
}
