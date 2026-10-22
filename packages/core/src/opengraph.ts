import type { OpenGraphData } from "@myndshelf/types";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return ENTITIES[lower] ?? m;
  });
}

function readAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? "");
  }
  return attrs;
}

function absolutize(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

/**
 * Extrai metadados OpenGraph / Twitter / HTML de uma página.
 * Puro (sem DOM) para rodar igual no desktop, web e mobile.
 */
export function parseOpenGraph(html: string, pageUrl: string): OpenGraphData {
  // só o <head> interessa — e páginas como o YouTube o deixam depois de ~800 KB de scripts
  const end = html.search(/<\/head>/i);
  const head = end > 0 ? html.slice(0, end) : html.slice(0, 2_000_000);
  const meta: Record<string, string> = {};

  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = readAttrs(tag);
    const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase();
    if (key && a.content && !(key in meta)) meta[key] = a.content.trim();
  }

  let favicon: string | undefined;
  let canonical: string | undefined;
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const a = readAttrs(tag);
    const rel = (a.rel ?? "").toLowerCase();
    if (!favicon && /\bicon\b/.test(rel)) favicon = a.href;
    if (rel === "apple-touch-icon") favicon = a.href;
    if (rel === "canonical") canonical = a.href;
  }

  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const base = absolutize(canonical, pageUrl) ?? pageUrl;

  return {
    title: meta["og:title"] ?? meta["twitter:title"] ?? (titleTag ? decodeEntities(titleTag.trim()) : undefined),
    description: meta["og:description"] ?? meta["twitter:description"] ?? meta["description"],
    image: absolutize(
      meta["og:image:secure_url"] ?? meta["og:image"] ?? meta["og:image:url"] ?? meta["twitter:image"] ?? meta["twitter:image:src"],
      base,
    ),
    siteName: meta["og:site_name"] ?? meta["application-name"],
    type: meta["og:type"],
    url: meta["og:url"] ?? canonical,
    favicon: absolutize(favicon ?? "/favicon.ico", base),
    author: meta["author"] ?? meta["music:musician_description"] ?? meta["book:author"] ?? meta["article:author"],
    themeColor: meta["theme-color"],
  };
}
