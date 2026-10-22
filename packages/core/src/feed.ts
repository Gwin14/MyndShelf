import { decodeEntities } from "./opengraph";

export interface ParsedFeed {
  title: string;
  description?: string;
  siteUrl?: string;
  icon?: string;
  entries: ParsedEntry[];
}

export interface ParsedEntry {
  guid: string;
  title: string;
  url?: string;
  summary?: string;
  image?: string;
  author?: string;
  publishedAt: number;
}

/** O texto parece RSS ou Atom? */
export function looksLikeFeed(text: string): boolean {
  const head = text.slice(0, 2000).toLowerCase();
  return /<rss[\s>]|<feed[\s>]|<rdf:rdf[\s>]/.test(head);
}

/** URLs com cara de feed — evita baixar a página duas vezes ao capturar. */
export function looksLikeFeedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      /(\/(feed|rss|atom)(\.xml)?\/?$|\.(rss|atom)$|\/rss\.xml$|\/atom\.xml$|\/index\.xml$|feeds?\.xml$)/i.test(u.pathname) ||
      (u.hostname.endsWith("youtube.com") && u.pathname.startsWith("/feeds/"))
    );
  } catch {
    return false;
  }
}

/** Procura <link rel="alternate" type="application/rss+xml"> numa página HTML. */
export function discoverFeedUrl(html: string, pageUrl: string): string | undefined {
  for (const tag of html.slice(0, 3_000_000).match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel=["']?alternate/i.test(tag) || !/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) {
      try {
        return new URL(decodeEntities(href), pageUrl).toString();
      } catch {
        /* ignore */
      }
    }
  }
  return undefined;
}

const unCdata = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

/** Conteúdo de uma tag (aceita prefixos de namespace como content:encoded). */
function tag(block: string, name: string): string | undefined {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = block.match(re);
  return m ? unCdata(m[1]).trim() : undefined;
}

function attr(block: string, name: string, attribute: string, filter?: RegExp): string | undefined {
  const re = new RegExp(`<${name}\\b[^>]*>`, "gi");
  for (const t of block.match(re) ?? []) {
    if (filter && !filter.test(t)) continue;
    const v = t.match(new RegExp(`${attribute}=["']([^"']+)["']`, "i"))?.[1];
    if (v) return decodeEntities(v);
  }
  return undefined;
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>|<\/p>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function firstImage(html?: string): string | undefined {
  const src = html?.match(/<img\b[^>]*src=["']([^"']+)["']/i)?.[1];
  return src ? decodeEntities(src) : undefined;
}

function absolutize(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

function parseDate(s?: string): number {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Lê RSS 2.0, RSS 1.0 (RDF) e Atom sem DOM — roda igual em qualquer plataforma.
 */
export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
  const isAtom = /<feed[\s>]/i.test(xml.slice(0, 2000));
  const blocks = xml.match(isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi) ?? [];
  const channel = xml.replace(/<(entry|item)\b[\s\S]*?<\/\1>/gi, "");

  const siteUrl = absolutize(
    isAtom ? attr(channel, "link", "href", /rel=["']alternate|^<link(?![^>]*rel=)/i) ?? attr(channel, "link", "href") : tag(channel, "link"),
    feedUrl,
  );

  const now = Date.now();
  const entries = blocks.map((b, i): ParsedEntry => {
    const link = isAtom
      ? attr(b, "link", "href", /rel=["']alternate/i) ?? attr(b, "link", "href", /^<link(?![^>]*rel=)/i) ?? attr(b, "link", "href")
      : tag(b, "link") ?? attr(b, "link", "href") ?? (tag(b, "guid")?.startsWith("http") ? tag(b, "guid") : undefined);
    const content = tag(b, "content:encoded") ?? tag(b, "content") ?? tag(b, "description") ?? tag(b, "summary") ?? tag(b, "media:description");
    const summary = content ? stripHtml(decodeEntities(content)).slice(0, 360) : undefined;
    const image =
      attr(b, "media:thumbnail", "url") ??
      attr(b, "media:content", "url", /medium=["']image|type=["']image/i) ??
      attr(b, "enclosure", "url", /type=["']image/i) ??
      attr(b, "itunes:image", "href") ??
      firstImage(content ? decodeEntities(content) : undefined);
    const url = absolutize(link ? decodeEntities(link) : undefined, feedUrl);
    const title = stripHtml(tag(b, "title") ?? "") || summary?.slice(0, 80) || "Sem título";
    const date = parseDate(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date"));
    return {
      guid: tag(b, "guid") ?? tag(b, "id") ?? url ?? `${title}-${i}`,
      title,
      url,
      summary,
      image: absolutize(image, feedUrl),
      author: stripHtml(tag(b, "dc:creator") ?? tag(tag(b, "author") ?? "", "name") ?? tag(b, "author") ?? "").replace(/\S+@\S+\s*/, "").replace(/[()]/g, "") || undefined,
      // sem data: mantém a ordem do feed
      publishedAt: date || now - i * 60_000,
    };
  });

  const host = (() => {
    try {
      return new URL(siteUrl ?? feedUrl).hostname.replace(/^www\./, "");
    } catch {
      return feedUrl;
    }
  })();

  return {
    title: stripHtml(tag(channel, "title") ?? "") || host,
    description: stripHtml(tag(channel, "description") ?? tag(channel, "subtitle") ?? "") || undefined,
    siteUrl,
    icon: absolutize(tag(tag(channel, "image") ?? "", "url") ?? tag(channel, "icon") ?? tag(channel, "logo") ?? attr(channel, "itunes:image", "href"), feedUrl),
    entries,
  };
}
