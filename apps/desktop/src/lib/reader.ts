import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import { fetchHtml } from "./platform";

export interface Article {
  title: string;
  byline?: string;
  siteName?: string;
  html: string;
  minutes: number;
}

const cache = new Map<string, Promise<Article | null>>();

/** Wikipedia tem uma versão móvel limpa, sem menus — melhor matéria-prima para o leitor. */
function sourceUrl(url: string): string {
  const u = new URL(url);
  const wiki = u.hostname.match(/^([a-z-]+)\.(?:m\.)?wikipedia\.org$/);
  if (wiki) u.hostname = `${wiki[1]}.m.wikipedia.org`;
  return u.toString();
}

async function extract(url: string): Promise<Article | null> {
  const raw = await fetchHtml(sourceUrl(url));
  const doc = new DOMParser().parseFromString(raw, "text/html");
  // Readability resolve links e imagens relativos a partir do <base>
  const base = doc.createElement("base");
  base.href = url;
  doc.head.prepend(base);
  doc.querySelectorAll(".mw-editsection, .navbox, .reference, .mw-jump-link, .hatnote").forEach((el) => el.remove());

  const parsed = new Readability(doc, { charThreshold: 300, keepClasses: false }).parse();
  if (!parsed?.content) return null;

  const html = DOMPurify.sanitize(parsed.content, {
    FORBID_TAGS: ["style", "form", "input", "button", "iframe", "script"],
    FORBID_ATTR: ["style", "width", "height"],
  });
  const words = (parsed.textContent ?? "").trim().split(/\s+/).length;
  return {
    title: parsed.title ?? "",
    byline: parsed.byline && !/contributors to wiki/i.test(parsed.byline) ? parsed.byline : undefined,
    siteName: parsed.siteName ?? undefined,
    html,
    minutes: Math.max(1, Math.round(words / 220)),
  };
}

export function loadArticle(url: string): Promise<Article | null> {
  if (!cache.has(url)) {
    const p = extract(url).catch(() => null);
    cache.set(url, p);
    void p.then((a) => !a && cache.delete(url));
  }
  return cache.get(url)!;
}
