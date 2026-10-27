import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AlignLeft, ArrowLeft, Copy, ExternalLink, List, Minus, Moon, Plus, Sun } from "lucide-react";
import { formatCoords, getEmbed, hostOf, mapLinks, viewModeOf } from "@myndshelf/core";
import type { CaptureItem } from "@myndshelf/types";
import { RunOutput } from "../../components/RunOutput";
import { summarizeCapture, useAiRun } from "../../lib/ai";
import { openExternal } from "../../lib/platform";
import { loadArticle, type Article, type ArticleLink, type Chapter } from "../../lib/reader";
import { Cover } from "./covers/Cover";
import { SocialPost } from "./SocialPost";

/** Abre o conteúdo do item dentro do app: player, leitor ou imagem em tela cheia. */
export function Viewer({ item, onClose }: { item: CaptureItem | undefined; onClose: () => void }) {

  // Esc fecha só o viewer (e não o detalhe que está por baixo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (!item) return null;
  const mode = viewModeOf(item);
  const style = { "--hue": item.hue } as CSSProperties;

  return createPortal(
    <div className={`viewer viewer-${mode}`} style={style}>
      {item.image && mode !== "read" && <div className="viewer-ambient" style={{ backgroundImage: `url("${item.image}")` }} />}
      <header className="viewer-bar">
        <button className="btn" onClick={onClose}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <span className="mono viewer-host">{item.siteName ?? hostOf(item.url)}</span>
        {item.url && (
          <button className="btn" onClick={() => openExternal(item.url!)}>
            <ExternalLink size={14} /> Original
          </button>
        )}
      </header>

      {mode === "play" && <Player item={item} />}
      {mode === "image" && <Lightbox item={item} />}
      {mode === "read" && <Reader item={item} />}
      {mode === "map" && <PlaceMap item={item} />}
      {mode === "post" && <SocialPost item={item} />}
    </div>,
    document.body,
  );
}

const IFRAME_ALLOW = "autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write";

function Player({ item }: { item: CaptureItem }) {
  const embed = getEmbed(item.url)!;

  if (embed.type === "audio") {
    return (
      <div className="viewer-audio">
        <div className="viewer-audio-cover">
          <Cover item={item} />
        </div>
        <div className="viewer-audio-side">
          <p className="kicker">{embed.provider} · tocando agora</p>
          <h2 className="viewer-title">{item.title}</h2>
          {item.author && <p className="viewer-sub">{item.author}</p>}
          <iframe
            className="viewer-audio-frame"
            src={embed.src}
            style={{ height: embed.height }}
            allow={IFRAME_ALLOW}
            referrerPolicy="strict-origin-when-cross-origin"
            title={item.title}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="viewer-theater">
      <div className="viewer-screen">
        <iframe src={embed.src} allow={IFRAME_ALLOW} allowFullScreen referrerPolicy="strict-origin-when-cross-origin" title={item.title} />
      </div>
      <div className="viewer-caption">
        <h2 className="viewer-title">{item.title}</h2>
        <p className="viewer-sub">
          {embed.provider}
          {item.author ? ` · ${item.author}` : ""}
        </p>
      </div>
    </div>
  );
}

function PlaceMap({ item }: { item: CaptureItem }) {
  const p = item.place!;
  const [copied, setCopied] = useState(false);
  const z = p.zoom ?? 16;
  const d = (360 / 2 ** z) * 2.2;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${p.lng! - d},${p.lat! - d * 0.6},${p.lng! + d},${p.lat! + d * 0.6}&layer=mapnik&marker=${p.lat},${p.lng}`;
  const coords = `${p.lat!.toFixed(6)}, ${p.lng!.toFixed(6)}`;

  return (
    <div className="viewer-place">
      <div className="viewer-place-map">
        <iframe src={src} title={item.title} referrerPolicy="strict-origin-when-cross-origin" />
      </div>
      <aside className="viewer-place-side">
        <p className="kicker">{p.provider ?? "Lugar"}</p>
        <h2 className="viewer-title">{item.title}</h2>
        {p.address && <p className="viewer-sub">{p.address}</p>}
        {p.query && p.query !== item.title && <p className="viewer-place-query mono">busca: “{p.query}”</p>}
        <button
          className="viewer-place-coords mono"
          title="Copiar coordenadas"
          onClick={() => {
            void navigator.clipboard?.writeText(coords);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {formatCoords(p.lat!, p.lng!)} <Copy size={11} /> {copied && <em>copiado</em>}
        </button>
        <p className="label mono">Abrir em</p>
        <div className="viewer-place-links">
          {mapLinks(p).map((l) => (
            <button key={l.label} className="btn" onClick={() => openExternal(l.url)}>
              <ExternalLink size={13} /> {l.label}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

function Lightbox({ item }: { item: CaptureItem }) {
  return (
    <figure className="viewer-lightbox">
      <img src={item.image} alt={item.title} referrerPolicy="no-referrer" />
      <figcaption className="mono">
        <span>{item.title}</span>
        <span>{item.siteName}</span>
      </figcaption>
    </figure>
  );
}

type ReaderState = { status: "loading" } | { status: "error" } | { status: "ready"; article: Article };

/** O último capítulo que já passou da linha de leitura é o que está na tela. */
function currentChapter(scroller: HTMLElement, chapters: Chapter[]): string | undefined {
  const line = scroller.getBoundingClientRect().top + 120;
  let current: string | undefined;
  for (const c of chapters) {
    const h = scroller.querySelector<HTMLElement>(`#${c.id}`);
    if (h && h.getBoundingClientRect().top <= line) current = c.id;
  }
  return current;
}

function LinkGroup({ title, links, showHost }: { title: string; links: ArticleLink[]; showHost: boolean }) {
  return (
    <section className="reader-link-group">
      <p className="kicker">
        {title} · {links.length}
      </p>
      {links.length ? (
        links.map((l) => (
          <button key={l.href} className="reader-link" title={l.href} onClick={() => openExternal(l.href)}>
            <span>{l.text}</span>
            {showHost && <em className="mono">{l.host}</em>}
          </button>
        ))
      ) : (
        <p className="reader-index-empty">Nenhum link.</p>
      )}
    </section>
  );
}

function Reader({ item }: { item: CaptureItem }) {
  const [state, setState] = useState<ReaderState>({ status: "loading" });
  const [paper, setPaper] = useState(() => localStorage.getItem("reader-theme") === "paper");
  const [size, setSize] = useState(() => Number(localStorage.getItem("reader-size")) || 19);
  const [progress, setProgress] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const [showSummary, setShowSummary] = useState(false);
  const summary = useAiRun();
  const [indexOpen, setIndexOpen] = useState(false);
  const [indexTab, setIndexTab] = useState<"chapters" | "links">("chapters");
  const [active, setActive] = useState<string>();

  const toggleSummary = () => {
    const next = !showSummary;
    setShowSummary(next);
    if (next && summary.state.status === "idle") void summary.run((onText, signal) => summarizeCapture(item, onText, signal));
    if (next) scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    let alive = true;
    void loadArticle(item.url!).then((article) => alive && setState(article ? { status: "ready", article } : { status: "error" }));
    return () => {
      alive = false;
    };
  }, [item.url]);

  useEffect(() => {
    try {
      localStorage.setItem("reader-theme", paper ? "paper" : "night");
      localStorage.setItem("reader-size", String(size));
    } catch {
      /* sem storage — tudo bem */
    }
  }, [paper, size]);

  const onScroll = () => {
    const el = scroller.current!;
    setProgress(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight));
    if (state.status === "ready") setActive(currentChapter(el, state.article.chapters));
  };

  const jumpTo = (id: string) => scroller.current?.querySelector<HTMLElement>(`#${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // links do texto abrem fora — o webview nunca sai do app
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    if (/^https?:/.test(a.href)) void openExternal(a.href);
  };

  const article = state.status === "ready" ? state.article : null;
  const hasLeadImage = article?.html.trimStart().slice(0, 400).includes("<img");

  return (
    <div className="reader" data-theme={paper ? "paper" : "night"} style={{ "--reader-size": `${size}px` } as CSSProperties}>
      <span className="reader-progress" style={{ transform: `scaleX(${progress})` }} />
      <div className="reader-tools">
        <button className="icon-btn" onClick={() => setSize((s) => Math.max(15, s - 1))} title="Diminuir texto">
          <Minus size={14} />
        </button>
        <span className="mono">{size}</span>
        <button className="icon-btn" onClick={() => setSize((s) => Math.min(26, s + 1))} title="Aumentar texto">
          <Plus size={14} />
        </button>
        <button className="icon-btn" onClick={() => setPaper((p) => !p)} title={paper ? "Modo noite" : "Modo papel"}>
          {paper ? <Moon size={14} /> : <Sun size={14} />}
        </button>
        <button className="icon-btn" aria-pressed={indexOpen} onClick={() => setIndexOpen((o) => !o)} title="Índice e links">
          <List size={14} />
        </button>
        <button className="icon-btn" aria-pressed={showSummary} onClick={toggleSummary} title="Resumo">
          <AlignLeft size={14} />
        </button>
      </div>

      {indexOpen && article && (
        <aside className="reader-index">
          <div className="reader-index-tabs" role="tablist">
            <button role="tab" aria-selected={indexTab === "chapters"} onClick={() => setIndexTab("chapters")}>
              Capítulos <span className="mono">{article.chapters.length}</span>
            </button>
            <button role="tab" aria-selected={indexTab === "links"} onClick={() => setIndexTab("links")}>
              Links <span className="mono">{article.links.inside.length + article.links.outside.length}</span>
            </button>
          </div>

          {indexTab === "chapters" ? (
            article.chapters.length ? (
              <nav className="reader-chapters">
                {article.chapters.map((c: Chapter) => (
                  <button key={c.id} className="reader-chapter" data-level={c.level} data-active={active === c.id || undefined} onClick={() => jumpTo(c.id)}>
                    {c.text}
                  </button>
                ))}
              </nav>
            ) : (
              <p className="reader-index-empty">Este texto não tem capítulos.</p>
            )
          ) : (
            <div className="reader-links">
              <LinkGroup title="Neste site" links={article.links.inside} showHost={false} />
              <LinkGroup title="De fora" links={article.links.outside} showHost />
            </div>
          )}
        </aside>
      )}

      <div className="reader-scroll" ref={scroller} onScroll={onScroll}>
        <article className="reader-page">
          <p className="kicker">
            {item.siteName ?? hostOf(item.url)}
            {article ? ` · ${article.minutes} min de leitura` : ""}
          </p>
          <h1 className="reader-title">{article?.title || item.title}</h1>
          {(article?.byline || item.author) && <p className="reader-byline">{article?.byline || item.author}</p>}
          <hr className="reader-rule" />

          {showSummary && (
            <aside className="reader-summary">
              <p className="kicker">Resumo</p>
              <RunOutput state={summary.state} label="resumindo" onRetry={summary.retry} />
            </aside>
          )}

          {state.status === "loading" && (
            <div className="reader-loading">
              <span className="cv-loading-orbit" />
              <span className="mono">trazendo o texto…</span>
            </div>
          )}

          {state.status === "error" && (
            <div className="reader-error">
              <p>Não deu para extrair o texto desta página.</p>
              <button className="btn btn-flare" onClick={() => openExternal(item.url!)}>
                <ExternalLink size={14} /> Abrir no navegador
              </button>
            </div>
          )}

          {article && (
            <>
              {!hasLeadImage && item.image && <img className="reader-hero" src={item.image} alt="" referrerPolicy="no-referrer" />}
              <div className="reader-body" data-site={article.site} onClick={onClick} dangerouslySetInnerHTML={{ __html: article.html }} />
              <p className="reader-end">✦</p>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
