import { AppState } from "react-native";
import { detectKind, findFeed, hueFrom, looksLikeFeed, parseFeed } from "@myndshelf/core";
import type { CaptureItem, Feed, FeedEntry } from "@myndshelf/types";
import { fetchHtml } from "./platform";
import { library, ready } from "./store";

const STALE_MS = 30 * 60_000;

/** Uma entrada de feed vestida de captura — para reaproveitar capas e o visualizador. */
export function entryAsItem(entry: FeedEntry, feed?: Feed): CaptureItem {
  return {
    id: entry.id,
    kind: entry.url ? detectKind(entry.url, { type: "article" }) : "note",
    url: entry.url,
    title: entry.title,
    description: entry.summary,
    image: entry.image,
    siteName: feed?.title,
    author: entry.author,
    note: entry.url ? undefined : entry.summary,
    tags: [],
    status: "ready",
    hue: feed?.hue ?? hueFrom(entry.id),
    createdAt: entry.publishedAt,
  };
}

/** Guarda a entrada como captura (uma vez só) e devolve o id dela. */
export function saveEntry(entry: FeedEntry): string {
  const s = library.getState();
  if (entry.savedAs && s.captures.some((c) => c.id === entry.savedAs)) return entry.savedAs;
  const feed = s.feeds.find((f) => f.id === entry.feedId);
  const { id: _id, ...item } = entryAsItem(entry, feed);
  const id = s.addCapture({ ...item, createdAt: Date.now() });
  s.updateEntry(entry.id, { savedAs: id, read: true });
  return id;
}

/**
 * Aceita qualquer link — o feed, o site, um canal do YouTube, um subreddit, um repo…
 * e encontra o RSS sozinho. Retorna o id do feed e como ele foi encontrado.
 */
export async function subscribe(input: string): Promise<{ id: string; via: string }> {
  const { url, text, via } = await findFeed(input, fetchHtml);
  const parsed = parseFeed(text, url);
  const s = library.getState();
  const id = s.addFeed({
    url,
    title: parsed.title,
    description: parsed.description,
    siteUrl: parsed.siteUrl,
    icon: parsed.icon,
    lastFetched: Date.now(),
  });
  s.mergeEntries(id, parsed.entries, true);
  return { id, via };
}

const inflight = new Map<string, Promise<void>>();

export function refreshFeed(id: string): Promise<void> {
  if (inflight.has(id)) return inflight.get(id)!;
  const run = (async () => {
    const feed = library.getState().feeds.find((f) => f.id === id);
    if (!feed) return;
    try {
      const text = await fetchHtml(feed.url);
      if (!looksLikeFeed(text)) throw new Error("resposta não é um feed");
      const parsed = parseFeed(text, feed.url);
      library.getState().mergeEntries(id, parsed.entries);
      library.getState().updateFeed(id, {
        lastFetched: Date.now(),
        error: undefined,
        icon: feed.icon ?? parsed.icon,
        siteUrl: feed.siteUrl ?? parsed.siteUrl,
      });
    } catch (e) {
      library.getState().updateFeed(id, { error: e instanceof Error ? e.message : String(e), lastFetched: Date.now() });
    }
  })().finally(() => inflight.delete(id));
  inflight.set(id, run);
  return run;
}

export async function refreshAll(force = false) {
  const now = Date.now();
  await Promise.all(
    library
      .getState()
      .feeds.filter((f) => force || !f.lastFetched || now - f.lastFetched > STALE_MS)
      .map((f) => refreshFeed(f.id)),
  );
}

/** Atualiza ao abrir, ao voltar do segundo plano e a cada 30 minutos com o app aberto. */
export function startFeedSync() {
  void ready().then(() => refreshAll());
  const timer = setInterval(() => void refreshAll(), STALE_MS);
  const sub = AppState.addEventListener("change", (state) => state === "active" && void refreshAll());
  return () => {
    clearInterval(timer);
    sub.remove();
  };
}
