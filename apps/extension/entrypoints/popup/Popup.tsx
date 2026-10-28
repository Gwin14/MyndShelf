import { useEffect, useRef, useState, type CSSProperties } from "react";
import { browser, type Browser } from "#imports";
import { hostOf } from "@myndshelf/core";
import { send } from "../../lib/send";
import { outbox, server, type ServerSettings } from "../../lib/settings";
import { activeTab, isCapturable, snapshot, type PageSnapshot } from "../../lib/tab";

type Phase = { kind: "idle" } | { kind: "saving" } | { kind: "done"; queued: boolean } | { kind: "error"; message: string };

// igual ao `.popup.leaving` do style.css
const EXIT_MS = 180;

// fecha com a transição de saída (clicar fora não passa por aqui: o navegador fecha na hora)
function closePopup(delay = 0) {
  setTimeout(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return window.close();
    document.body.classList.add("leaving");
    setTimeout(() => window.close(), EXIT_MS);
  }, delay);
}

export function Popup() {
  const [settings, setSettings] = useState<ServerSettings | null | undefined>();
  // undefined enquanto carrega, null sem aba
  const [tab, setTab] = useState<Browser.tabs.Tab | null>();
  const [page, setPage] = useState<PageSnapshot>({});
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [pending, setPending] = useState(0);
  // depois de guardar, a celebração toma o lugar de tudo, com a mesma altura (a janela não pula)
  const [celebrate, setCelebrate] = useState<{ queued: boolean; height: number }>();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void server.getValue().then(setSettings);
    void outbox.getValue().then((o) => setPending(o.length));
    const unwatch = outbox.watch((o) => setPending(o?.length ?? 0));
    void activeTab().then(async (t) => {
      setTab(t ?? null);
      if (!t) return;
      const snap = await snapshot(t);
      setPage(snap);
      // o trecho selecionado vira o comentário da captura
      if (snap.selection) setNote(snap.selection);
    });
    return unwatch;
  }, []);

  // a aba chega depois: o campo só deixa de estar desabilitado aí
  useEffect(() => noteRef.current?.focus(), [settings, tab]);

  if (settings === undefined) return null;
  if (!settings) return <NotConnected />;

  const url = tab?.url;
  if (celebrate) return <Saved queued={celebrate.queued} height={celebrate.height} title={tab?.title || hostOf(url)} />;

  const capturable = isCapturable(url);
  const loading = tab === undefined;
  const busy = phase.kind === "saving" || phase.kind === "done";
  const label =
    phase.kind === "saving" ? "Lendo a página…" : phase.kind === "done" ? (phase.queued ? "Na fila ✦" : "Guardado ✦") : "Guardar na Captura";

  async function save() {
    if (!url || !capturable || busy) return;
    setPhase({ kind: "saving" });
    const res = await send({ type: "save", input: { type: "page", url, title: tab?.title, note, html: page.html } }).catch((e) => ({
      ok: false as const,
      error: String(e),
    }));
    if (!res.ok) return setPhase({ kind: "error", message: res.error });
    setPhase({ kind: "done", queued: res.queued });
    const height = mainRef.current?.offsetHeight ?? 0;
    // o conteúdo sai primeiro (.popup-main.is-leaving), depois entra a celebração
    setTimeout(() => setCelebrate({ queued: res.queued, height }), EXIT_MS);
    closePopup(res.queued ? 2600 : 2000);
  }

  return (
    <main ref={mainRef} className={phase.kind === "done" ? "popup-main is-leaving" : "popup-main"}>
      <header className="bar">
        <span className="brand">MyndShelf <i>✦</i></span>
        <button className="ghost" title="Ajustes" onClick={() => void browser.runtime.openOptionsPage()}>
          ajustes
        </button>
      </header>

      {loading ? (
        <article key="loading" className="preview" aria-busy="true">
          <span className="favicon skeleton" />
          <div className="skeleton-lines">
            <span className="skeleton" />
            <span className="skeleton short" />
          </div>
        </article>
      ) : capturable ? (
        <article key="page" className="preview">
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

      <button className={`primary is-${phase.kind}`} disabled={loading || !capturable || busy} onClick={() => void save()}>
        <span key={label} className="swap">
          {label}
        </span>
      </button>

      <footer className="status">
        {phase.kind === "error" ? (
          <span key={`error:${phase.message}`} className="swap error">
            {phase.message}
          </span>
        ) : phase.kind === "done" && phase.queued ? (
          <span key="queued" className="swap">
            O servidor não respondeu. Sobe sozinho quando ele voltar.
          </span>
        ) : pending ? (
          <button key="pending" className="swap ghost" onClick={() => void send({ type: "flush" })}>
            {pending === 1 ? "1 item esperando na fila" : `${pending} itens esperando na fila`} · enviar agora
          </button>
        ) : (
          <span key="keys" className="swap">
            <kbd>↵</kbd> guarda · <kbd>⇧↵</kbd> nova linha
          </span>
        )}
      </footer>
    </main>
  );
}

const SPARK_COLORS = ["var(--c-cyan)", "var(--c-sun)", "var(--c-amber)", "var(--c-ember)", "var(--c-magenta)", "var(--c-paper)"];

// sorteadas uma vez por abertura: cada celebração sai um pouco diferente
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
  const dist = 64 + Math.random() * 70;
  return {
    "--x": `${Math.cos(angle) * dist}px`,
    "--y": `${Math.sin(angle) * dist}px`,
    "--size": `${3 + Math.random() * 5}px`,
    "--delay": `${120 + Math.random() * 160}ms`,
    "--color": SPARK_COLORS[i % SPARK_COLORS.length],
    star: i % 3 === 0,
  };
});

function Saved({ queued, height, title }: { queued: boolean; height: number; title: string }) {
  return (
    <main className={queued ? "saved is-queued" : "saved"} style={{ minHeight: height }} role="status">
      <div className="saved-stage" aria-hidden="true">
        <span className="saved-bloom" />
        <span className="saved-ring" />
        <span className="saved-ring late" />
        {SPARKS.map(({ star, ...vars }, i) => (
          <span key={i} className={star ? "saved-spark is-star" : "saved-spark"} style={vars as CSSProperties} />
        ))}
        <span className="saved-star">✦</span>
      </div>
      <h1 className="saved-title">
        {queued ? "Na fila" : "Guardado"} <i>✦</i>
      </h1>
      <p className="saved-sub">{queued ? "Sobe sozinho quando o servidor voltar." : title}</p>
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
          closePopup();
        }}
      >
        Conectar ao servidor
      </button>
    </main>
  );
}
