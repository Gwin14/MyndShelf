import { useEffect, useRef, useState } from "react";
import { browser, type Browser } from "#imports";
import { hostOf } from "@myndshelf/core";
import { send } from "../../lib/send";
import { outbox, server, type ServerSettings } from "../../lib/settings";
import { activeTab, isCapturable, snapshot, type PageSnapshot } from "../../lib/tab";

type Phase = { kind: "idle" } | { kind: "saving" } | { kind: "done"; queued: boolean } | { kind: "error"; message: string };

export function Popup() {
  const [settings, setSettings] = useState<ServerSettings | null | undefined>();
  const [tab, setTab] = useState<Browser.tabs.Tab>();
  const [page, setPage] = useState<PageSnapshot>({});
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [pending, setPending] = useState(0);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void server.getValue().then(setSettings);
    void outbox.getValue().then((o) => setPending(o.length));
    const unwatch = outbox.watch((o) => setPending(o?.length ?? 0));
    void activeTab().then(async (t) => {
      setTab(t);
      if (!t) return;
      const snap = await snapshot(t);
      setPage(snap);
      // o trecho selecionado vira o comentário da captura
      if (snap.selection) setNote(snap.selection);
    });
    return unwatch;
  }, []);

  useEffect(() => noteRef.current?.focus(), [settings]);

  if (settings === undefined) return null;
  if (!settings) return <NotConnected />;

  const url = tab?.url;
  const capturable = isCapturable(url);
  const busy = phase.kind === "saving" || phase.kind === "done";

  async function save() {
    if (!url || !capturable || busy) return;
    setPhase({ kind: "saving" });
    const res = await send({ type: "save", input: { type: "page", url, title: tab?.title, note, html: page.html } }).catch((e) => ({
      ok: false as const,
      error: String(e),
    }));
    if (!res.ok) return setPhase({ kind: "error", message: res.error });
    setPhase({ kind: "done", queued: res.queued });
    setTimeout(() => window.close(), res.queued ? 1600 : 900);
  }

  return (
    <main className="popup-main">
      <header className="bar">
        <span className="brand">MyndShelf <i>✦</i></span>
        <button className="ghost" title="Ajustes" onClick={() => void browser.runtime.openOptionsPage()}>
          ajustes
        </button>
      </header>

      {capturable ? (
        <article className="preview">
          {tab?.favIconUrl ? <img className="favicon" src={tab.favIconUrl} alt="" /> : <span className="favicon dot" />}
          <div>
            <h1>{tab?.title || url}</h1>
            <p className="host">{hostOf(url)}</p>
          </div>
        </article>
      ) : (
        <p className="hint">Esta página não pode ser capturada. Abra um site e tente de novo.</p>
      )}

      <textarea
        ref={noteRef}
        className="note"
        placeholder="Um comentário, se quiser…"
        value={note}
        rows={3}
        disabled={!capturable || busy}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void save();
          }
        }}
      />

      <button className="primary" disabled={!capturable || busy} onClick={() => void save()}>
        {phase.kind === "saving" ? "Lendo a página…" : phase.kind === "done" ? (phase.queued ? "Na fila ✦" : "Guardado ✦") : "Guardar na Captura"}
      </button>

      <footer className="status">
        {phase.kind === "error" ? (
          <span className="error">{phase.message}</span>
        ) : phase.kind === "done" && phase.queued ? (
          <span>O servidor não respondeu. Sobe sozinho quando ele voltar.</span>
        ) : pending ? (
          <button className="ghost" onClick={() => void send({ type: "flush" })}>
            {pending === 1 ? "1 item esperando na fila" : `${pending} itens esperando na fila`} · enviar agora
          </button>
        ) : (
          <span>
            <kbd>↵</kbd> guarda · <kbd>⇧↵</kbd> nova linha
          </span>
        )}
      </footer>
    </main>
  );
}

function NotConnected() {
  return (
    <main className="popup-main">
      <header className="bar">
        <span className="brand">MyndShelf <i>✦</i></span>
      </header>
      <p className="hint">
        A extensão guarda direto no seu servidor do MyndShelf — o app não precisa estar aberto. Conecte com o mesmo endereço e token dos apps.
      </p>
      <button
        className="primary"
        onClick={() => {
          void browser.runtime.openOptionsPage();
          window.close();
        }}
      >
        Conectar ao servidor
      </button>
    </main>
  );
}
