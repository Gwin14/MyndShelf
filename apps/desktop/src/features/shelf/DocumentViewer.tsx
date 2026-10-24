import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Code2, Download, ExternalLink, Eye, Globe, Minus, Moon, Plus, RotateCw, ScanText, ShieldCheck, Sun, X } from "lucide-react";
import type { Creation } from "@myndshelf/types";
import { docLabel, docKindOf, loadDocContent, openPdf, pdfCover, type DocContent, type DocKind } from "../../lib/documents";
import { openExternal } from "../../lib/platform";
import { buildSandboxDoc, OPEN_LINK_MESSAGE, SANDBOX_FLAGS, type SandboxDoc } from "../../lib/sandbox";
import { fileStore, library } from "../../lib/store";
import { Prose } from "../../components/Prose";
import { RunOutput } from "../../components/RunOutput";
import { analyzeCreation, useAiRun } from "../../lib/ai";

type PdfDoc = Awaited<ReturnType<typeof openPdf>>;

/** Abre documentos da Estante dentro do app: PDF página a página, o resto no leitor. */
export function DocumentViewer({ item, onClose }: { item: Creation; onClose: () => void }) {
  const kind = docKindOf(item)!;
  const [blob, setBlob] = useState<Blob | null | undefined>(undefined);
  const [blobUrl, setBlobUrl] = useState<string>();
  // aberto = painel visível; montado continua true durante a animação de saída
  const [panel, setPanel] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const togglePanel = () => {
    if (!panel) setPanelMounted(true);
    setPanel(!panel);
  };

  useEffect(() => {
    let url: string | undefined;
    void fileStore.get(item.id).then((b) => {
      setBlob(b ?? null);
      if (b) setBlobUrl((url = URL.createObjectURL(b)));
      // PDFs guardados antes de existir capa ganham a primeira página como capa
      if (b && kind === "pdf" && !item.preview) {
        void pdfCover(b).then((preview) => preview && library.getState().updateCreation(item.id, { preview }));
      }
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.id]);

  // Esc fecha só o visualizador (o detalhe continua por baixo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="viewer viewer-doc" data-panel={panel || undefined} style={{ "--hue": item.hue } as CSSProperties}>
      <header className="viewer-bar">
        <button className="btn" onClick={onClose}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <span className="mono viewer-host">
          {docLabel(kind, item.fileName)} · {item.fileName}
        </span>
        <span className="viewer-actions">
          {blob && (
            <button className="btn" aria-pressed={panel} onClick={togglePanel}>
              <ScanText size={14} /> Analisar
            </button>
          )}
          {blobUrl && (
            <a className="btn" href={blobUrl} download={item.fileName}>
              <Download size={14} /> Exportar
            </a>
          )}
        </span>
      </header>

      {blob === null && (
        <div className="reader-error">
          <p>O arquivo original não está mais guardado.</p>
        </div>
      )}
      {blob && kind === "pdf" && <PdfPages blob={blob} />}
      {blob && kind === "html" && <HtmlPreview item={item} blob={blob} />}
      {blob && kind !== "pdf" && kind !== "html" && <DocReader item={item} kind={kind} blob={blob} />}
      {panelMounted && <DocPanel item={item} open={panel} onClose={() => setPanel(false)} onGone={() => setPanelMounted(false)} />}
    </div>,
    document.body,
  );
}

/* ───────────────────────── leitura do documento ───────────────────────── */

function DocPanel({ item, open, onClose, onGone }: { item: Creation; open: boolean; onClose: () => void; onGone: () => void }) {
  const analysis = useAiRun();
  const busy = analysis.state.status === "thinking" || analysis.state.status === "streaming";
  const analyze = () => void analysis.run((onText, signal) => analyzeCreation(item, onText, signal));

  // a primeira abertura já lê o documento; depois fica guardado
  useEffect(() => {
    if (!item.analysis) analyze();
  }, [item.id]);

  return (
    <aside className="doc-panel" data-closing={!open || undefined} onAnimationEnd={(e) => !open && e.target === e.currentTarget && onGone()}>
      <header className="doc-panel-head">
        <p className="kicker">Leitura</p>
        {item.analysis && !busy && (
          <button className="icon-btn" onClick={analyze} title="Ler de novo">
            <RotateCw size={13} />
          </button>
        )}
        <button className="icon-btn" onClick={onClose} title="Fechar">
          <X size={15} />
        </button>
      </header>
      <div className="doc-panel-body">
        {analysis.state.status === "idle" && item.analysis ? (
          <Prose text={item.analysis} />
        ) : (
          <RunOutput state={analysis.state} label="lendo o documento" onRetry={analysis.retry} />
        )}
      </div>
    </aside>
  );
}

/* ───────────────────────── PDF ───────────────────────── */

function PdfPages({ blob }: { blob: Blob }) {
  const [doc, setDoc] = useState<PdfDoc>();
  const [error, setError] = useState(false);
  const [ratio, setRatio] = useState(1.414);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const [progress, setProgress] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(820);

  // a página cabe na largura da janela (zoom 100% = largura confortável de leitura)
  useEffect(() => {
    const el = scroller.current!;
    const ro = new ResizeObserver(() => setAvailable(el.clientWidth - 48));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    let opened: PdfDoc | undefined;
    openPdf(blob)
      .then(async (d) => {
        opened = d;
        const first = await d.getPage(1);
        const v = first.getViewport({ scale: 1 });
        if (!alive) return;
        setRatio(v.height / v.width);
        setDoc(d);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
      void opened?.loadingTask.destroy();
    };
  }, [blob]);

  const onScroll = () => {
    const el = scroller.current!;
    setProgress(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight));
    // página atual = a que cruza o meio da tela
    const mid = el.scrollTop + el.clientHeight / 2;
    const pages = el.querySelectorAll<HTMLElement>(".pdf-page");
    for (const p of pages) {
      if (p.offsetTop <= mid && p.offsetTop + p.offsetHeight >= mid) {
        setCurrent(Number(p.dataset.page));
        break;
      }
    }
  };

  if (error) {
    return (
      <div className="reader-error">
        <p>Não deu para abrir este PDF.</p>
      </div>
    );
  }

  const width = Math.round(Math.min(820, available) * zoom);

  return (
    <div className="pdf">
      <span className="reader-progress" style={{ transform: `scaleX(${progress})` }} />
      <div className="reader-tools">
        <button className="icon-btn" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} title="Diminuir">
          <Minus size={14} />
        </button>
        <span className="mono">{Math.round(zoom * 100)}%</span>
        <button className="icon-btn" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} title="Aumentar">
          <Plus size={14} />
        </button>
        {doc && (
          <span className="mono pdf-count">
            {current} / {doc.numPages}
          </span>
        )}
      </div>
      <div className="pdf-scroll" ref={scroller} onScroll={onScroll}>
        {!doc && (
          <div className="reader-loading">
            <span className="cv-loading-orbit" />
            <span className="mono">abrindo o documento…</span>
          </div>
        )}
        {doc &&
          Array.from({ length: doc.numPages }, (_, i) => (
            <PdfPage key={i} doc={doc} number={i + 1} width={width} ratio={ratio} root={scroller} />
          ))}
      </div>
    </div>
  );
}

/** Uma página: só desenha quando chega perto da tela, em resolução retina. */
function PdfPage({
  doc,
  number,
  width,
  ratio,
  root,
}: {
  doc: PdfDoc;
  number: number;
  width: number;
  ratio: number;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [pageRatio, setPageRatio] = useState(ratio);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), {
      root: root.current,
      rootMargin: "1200px 0px",
    });
    io.observe(ref.current!);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    if (!visible) return;
    let task: { cancel(): void; promise: Promise<void> } | undefined;
    let alive = true;
    void doc.getPage(number).then((page) => {
      if (!alive) return;
      const base = page.getViewport({ scale: 1 });
      setPageRatio(base.height / base.width);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const c = canvas.current!;
      c.width = Math.round(viewport.width);
      c.height = Math.round(viewport.height);
      task = page.render({ canvas: c, viewport });
      task.promise.catch(() => {});
    });
    return () => {
      alive = false;
      task?.cancel();
    };
  }, [visible, doc, number, width]);

  return (
    <div ref={ref} className="pdf-page" data-page={number} style={{ width, height: width * pageRatio }}>
      <canvas ref={canvas} />
      <span className="pdf-folio mono">{number}</span>
    </div>
  );
}

/* ───────────────────────── HTML com CSS e JS, isolado ───────────────────────── */

/** Arquivos da Estante com o mesmo nome do caminho citado (style.css, js/app.js → app.js). */
async function resolveFromShelf(path: string): Promise<Blob | undefined> {
  const name = decodeURIComponent(path).split("/").pop()?.toLowerCase();
  if (!name) return;
  const match = library.getState().creations.find((c) => c.fileName?.toLowerCase() === name);
  return match ? fileStore.get(match.id) : undefined;
}

function HtmlPreview({ item, blob }: { item: Creation; blob: Blob }) {
  const [view, setView] = useState<"page" | "source">("page");
  const [allowNetwork, setAllowNetwork] = useState(false);
  const [source, setSource] = useState<string>();
  const [doc, setDoc] = useState<SandboxDoc>();
  const [run, setRun] = useState(0);
  const [pendingLink, setPendingLink] = useState<string>();
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    void blob.text().then(setSource);
  }, [blob]);

  useEffect(() => {
    if (source == null) return;
    let alive = true;
    void buildSandboxDoc(source, { allowNetwork, resolve: resolveFromShelf }).then((d) => alive && setDoc(d));
    return () => {
      alive = false;
    };
  }, [source, allowNetwork]);

  // só aceita mensagens vindas deste iframe, e só para pedir abertura de link
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const data = e.data as { type?: string; url?: string };
      if (data?.type === OPEN_LINK_MESSAGE && typeof data.url === "string" && /^https?:\/\//.test(data.url)) {
        setPendingLink(data.url.slice(0, 2000));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="html-preview">
      <div className="html-toolbar">
        <div className="seg">
          <button aria-pressed={view === "page"} onClick={() => setView("page")} title="Página">
            <Eye size={14} />
          </button>
          <button aria-pressed={view === "source"} onClick={() => setView("source")} title="Código-fonte">
            <Code2 size={14} />
          </button>
        </div>
        <span className="html-shield mono" data-open={allowNetwork || undefined}>
          <ShieldCheck size={12} /> isolado do app · {allowNetwork ? "internet liberada" : "sem internet"}
        </span>
        <button
          className="btn html-net"
          aria-pressed={allowNetwork}
          onClick={() => setAllowNetwork((v) => !v)}
          title="Deixar a página carregar scripts, estilos e dados da internet (https)"
        >
          <Globe size={13} /> {allowNetwork ? "Bloquear internet" : "Permitir internet"}
        </button>
        <button className="icon-btn" onClick={() => setRun((n) => n + 1)} title="Recarregar">
          <RotateCw size={14} />
        </button>
      </div>

      {doc && (doc.missing.length > 0 || doc.embedded.length > 0) && (
        <p className="html-assets mono">
          {doc.embedded.length > 0 && <span>✦ embutidos da Estante: {doc.embedded.join(", ")}</span>}
          {doc.missing.length > 0 && <span className="html-missing">⚠ não encontrados: {doc.missing.join(", ")} — adicione esses arquivos à Estante</span>}
        </p>
      )}

      {view === "page" ? (
        <div className="html-stage">
          {doc && (
            <iframe
              key={run}
              ref={frame}
              className="html-frame"
              title={item.title}
              sandbox={SANDBOX_FLAGS}
              referrerPolicy="no-referrer"
              srcDoc={doc.html}
            />
          )}
          {pendingLink && (
            <div className="html-link-ask">
              <span>A página quer abrir</span>
              <code>{pendingLink}</code>
              <button
                className="btn btn-flare"
                onClick={() => {
                  void openExternal(pendingLink);
                  setPendingLink(undefined);
                }}
              >
                <ExternalLink size={13} /> Abrir no navegador
              </button>
              <button className="icon-btn" onClick={() => setPendingLink(undefined)} title="Ignorar">
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="reader-scroll html-source">
          <pre className="doc-code">
            <code>{source}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── leitor (Word, Markdown, texto…) ───────────────────────── */

function DocReader({ item, kind, blob }: { item: Creation; kind: Exclude<DocKind, "pdf">; blob: Blob }) {
  const [content, setContent] = useState<DocContent | null | undefined>(undefined);
  const [paper, setPaper] = useState(() => localStorage.getItem("reader-theme") === "paper");
  const [size, setSize] = useState(() => Number(localStorage.getItem("reader-size")) || 19);
  const [progress, setProgress] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadDocContent(kind, blob, item.fileName)
      .then((c) => alive && setContent(c))
      .catch(() => alive && setContent(null));
    return () => {
      alive = false;
    };
  }, [kind, blob, item.fileName]);

  useEffect(() => {
    try {
      localStorage.setItem("reader-theme", paper ? "paper" : "night");
      localStorage.setItem("reader-size", String(size));
    } catch {
      /* sem storage */
    }
  }, [paper, size]);

  // se o documento abre com um <h1>, ele vira o título da página (sem repetir)
  const lead = content?.type === "html" ? content.html.trimStart().match(/^<h1[^>]*>([\s\S]*?)<\/h1>/) : null;
  const heading = lead ? lead[1].replace(/<[^>]+>/g, "").trim() : undefined;
  const bodyHtml = content?.type === "html" ? (lead ? content.html.trimStart().slice(lead[0].length) : content.html) : "";

  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    if (/^https?:/.test(a.href)) void openExternal(a.href);
  };

  return (
    <div className="reader" data-theme={paper ? "paper" : "night"} style={{ "--reader-size": `${size}px` } as CSSProperties}>
      <span className="reader-progress" style={{ transform: `scaleX(${progress})` }} />
      <div className="reader-tools">
        <button className="icon-btn" onClick={() => setSize((s) => Math.max(13, s - 1))} title="Diminuir texto">
          <Minus size={14} />
        </button>
        <span className="mono">{size}</span>
        <button className="icon-btn" onClick={() => setSize((s) => Math.min(26, s + 1))} title="Aumentar texto">
          <Plus size={14} />
        </button>
        <button className="icon-btn" onClick={() => setPaper((p) => !p)} title={paper ? "Modo noite" : "Modo papel"}>
          {paper ? <Moon size={14} /> : <Sun size={14} />}
        </button>
      </div>
      <div
        className="reader-scroll"
        ref={scroller}
        onScroll={() => {
          const el = scroller.current!;
          setProgress(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight));
        }}
      >
        <article className={`reader-page ${content?.type === "table" || content?.type === "code" ? "reader-wide" : ""}`}>
          <p className="kicker">
            {docLabel(kind, item.fileName)}
            {item.year ? ` · ${item.year}` : ""}
            {content?.type === "html" ? ` · ${Math.max(1, Math.round(content.words / 220))} min de leitura` : ""}
          </p>
          <h1 className="reader-title">{heading || item.title}</h1>
          <hr className="reader-rule" />

          {content === undefined && (
            <div className="reader-loading">
              <span className="cv-loading-orbit" />
              <span className="mono">abrindo o documento…</span>
            </div>
          )}
          {content === null && (
            <div className="reader-error">
              <p>Não deu para ler este arquivo.</p>
            </div>
          )}
          {content?.type === "html" && (
            <div className="reader-body" onClick={onClick} dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          )}
          {content?.type === "code" && (
            <pre className="doc-code">
              <code>{content.text}</code>
            </pre>
          )}
          {content?.type === "table" && (
            <div className="doc-table-wrap">
              <table className="doc-table">
                <thead>
                  <tr>
                    {content.rows[0]?.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {content.rows.slice(1).map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {content && <p className="reader-end">✦</p>}
        </article>
      </div>
    </div>
  );
}
