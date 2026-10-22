import { useMemo, useState, type CSSProperties } from "react";
import { BookOpen, Bookmark, BookmarkCheck, CheckCheck, ExternalLink, Play, RefreshCw, Trash2 } from "lucide-react";
import { hostOf, VIEW_LABELS, viewModeOf } from "@myndshelf/core";
import type { Feed, FeedEntry } from "@myndshelf/types";
import { Headline } from "../../components/Headline";
import { captureText } from "../../lib/capture";
import { entryAsItem, refreshAll, refreshFeed } from "../../lib/feeds";
import { openExternal } from "../../lib/platform";
import { library, useLibrary } from "../../lib/store";
import { useUi } from "../../lib/ui";
import { Viewer } from "./Viewer";

/** Cada feed ganha uma "frequência" estável, como uma estação de rádio. */
export const frequencyOf = (hue: number) => (88 + (hue / 360) * 20).toFixed(1);

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const diff = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  const s = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function FeedView({ feedId }: { feedId: string }) {
  const feeds = useLibrary((s) => s.feeds);
  const allEntries = useLibrary((s) => s.feedEntries);
  const query = useUi((s) => s.captureQuery);
  const set = useUi((s) => s.set);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewing, setViewing] = useState<FeedEntry | null>(null);

  const feed = feeds.find((f) => f.id === feedId);
  const feedsById = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allEntries
      .filter(
        (e) =>
          (feedId === "all" || e.feedId === feedId) &&
          (!onlyUnread || !e.read) &&
          (!q || [e.title, e.summary, e.author].some((t) => t?.toLowerCase().includes(q))),
      )
      .sort((a, b) => b.publishedAt - a.publishedAt);
  }, [allEntries, feedId, onlyUnread, query]);

  const groups = useMemo(() => {
    const out: { label: string; items: FeedEntry[] }[] = [];
    for (const e of entries) {
      const label = dayLabel(e.publishedAt);
      if (out.at(-1)?.label !== label) out.push({ label, items: [] });
      out.at(-1)!.items.push(e);
    }
    return out;
  }, [entries]);

  const unread = allEntries.filter((e) => (feedId === "all" || e.feedId === feedId) && !e.read).length;
  if (feedId !== "all" && !feed) return null;

  const refresh = async () => {
    setRefreshing(true);
    await (feed ? refreshFeed(feed.id) : refreshAll(true));
    setRefreshing(false);
  };

  const open = (e: FeedEntry) => {
    library.getState().updateEntry(e.id, { read: true });
    const item = entryAsItem(e, feedsById.get(e.feedId));
    if (viewModeOf(item)) setViewing(e);
    else if (e.url) void openExternal(e.url);
  };

  const save = async (e: FeedEntry) => {
    if (e.savedAs || !e.url) return;
    const id = await captureText(e.url);
    if (id) library.getState().updateEntry(e.id, { savedAs: id, read: true });
  };

  const style = { "--hue": feed?.hue ?? 30 } as CSSProperties;

  return (
    <div className="stage-pad feed-stage" style={style}>
      <Headline
        kicker={`I — Captura · ${feed ? `FM ${frequencyOf(feed.hue)}` : "Todas as transmissões"} · ${unread} ${unread === 1 ? "nova" : "novas"}`}
        aside={
          <div className="feed-actions">
            <button className="btn" aria-pressed={onlyUnread} onClick={() => setOnlyUnread((v) => !v)}>
              {onlyUnread ? "Só novas" : "Todas"}
            </button>
            <button className="btn" onClick={() => library.getState().markFeedRead(feed?.id ?? null)} title="Marcar tudo como lido">
              <CheckCheck size={14} />
            </button>
            <button className="btn" onClick={refresh} title="Sintonizar de novo" data-spinning={refreshing || undefined}>
              <RefreshCw size={14} />
            </button>
            {feed?.siteUrl && (
              <button className="btn" onClick={() => openExternal(feed.siteUrl!)} title="Abrir o site">
                <ExternalLink size={14} />
              </button>
            )}
            {feed && (
              <button
                className="btn btn-danger"
                title="Cancelar assinatura"
                onClick={() => {
                  if (!confirm(`Deixar de seguir “${feed.title}”?`)) return;
                  library.getState().removeFeed(feed.id);
                  set({ captureFeed: null });
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        }
      >
        {feed ? feed.title : (
          <>
            Sinais de <em>longe</em>.
          </>
        )}
      </Headline>

      {feed?.description && <p className="feed-desc">{feed.description}</p>}
      {feed?.error && <p className="feed-error mono">⚠ sem sinal: {feed.error}</p>}

      {!entries.length && (
        <div className="empty">
          <div className="empty-orbit" />
          <p className="empty-title">{onlyUnread ? "Nada de novo no ar." : "Estática."}</p>
          <p>{onlyUnread ? "Você ouviu tudo o que chegou." : "Nenhuma transmissão por aqui ainda."}</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.label} className="tx-day">
          <h2 className="tx-day-label">{g.label}</h2>
          {g.items.map((e, i) => (
            <Transmission
              key={e.id}
              entry={e}
              feed={feedsById.get(e.feedId)}
              showSource={feedId === "all"}
              index={i}
              onOpen={() => open(e)}
              onSave={() => save(e)}
            />
          ))}
        </section>
      ))}

      {viewing && <Viewer item={entryAsItem(viewing, feedsById.get(viewing.feedId))} onClose={() => setViewing(null)} />}
    </div>
  );
}

function Transmission({
  entry,
  feed,
  showSource,
  index,
  onOpen,
  onSave,
}: {
  entry: FeedEntry;
  feed?: Feed;
  showSource: boolean;
  index: number;
  onOpen(): void;
  onSave(): void;
}) {
  const [imgOk, setImgOk] = useState(true);
  const mode = viewModeOf(entryAsItem(entry, feed));
  const time = new Date(entry.publishedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <article
      className="tx"
      data-read={entry.read || undefined}
      style={{ "--hue": feed?.hue ?? 30, animationDelay: `${Math.min(index, 12) * 30}ms` } as CSSProperties}
      onClick={onOpen}
    >
      <span className="tx-signal" aria-label={entry.read ? undefined : "nova"} />
      <div className="tx-body">
        <p className="tx-meta mono">
          {showSource && feed && <span className="tx-source">{feed.title}</span>}
          <span>{time}</span>
          {entry.author && entry.author !== feed?.title && <span>{entry.author}</span>}
          {!showSource && entry.url && <span>{hostOf(entry.url)}</span>}
        </p>
        <h3 className="tx-title">{entry.title}</h3>
        {entry.summary && <p className="tx-summary">{entry.summary}</p>}
        <div className="tx-actions" onClick={(ev) => ev.stopPropagation()}>
          {mode && (
            <button className="tx-btn" onClick={onOpen}>
              {mode === "play" ? <Play size={11} fill="currentColor" /> : <BookOpen size={11} />} {VIEW_LABELS[mode]}
            </button>
          )}
          {entry.url && (
            <button className="tx-btn" onClick={onSave} disabled={!!entry.savedAs} data-saved={entry.savedAs ? true : undefined}>
              {entry.savedAs ? <BookmarkCheck size={11} /> : <Bookmark size={11} />} {entry.savedAs ? "Guardado" : "Guardar"}
            </button>
          )}
          {entry.url && (
            <button className="tx-btn" onClick={() => openExternal(entry.url!)}>
              <ExternalLink size={11} /> Original
            </button>
          )}
        </div>
      </div>
      {entry.image && imgOk && (
        <div className="tx-thumb">
          <img src={entry.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />
        </div>
      )}
    </article>
  );
}
