import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { fetchHtml } from "./platform";

export interface Article {
  title: string;
  byline?: string;
  siteName?: string;
  html: string;
  text: string;
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

const STRIP = "script, style, noscript, iframe, form, input, button, svg, .mw-editsection, .navbox, .reference, .mw-jump-link, .hatnote";

/** Sem DOM no celular: o linkedom monta um documento em JS puro para o Readability. */
async function extract(url: string): Promise<Article | null> {
  const raw = await fetchHtml(sourceUrl(url));
  const { document } = parseHTML(raw);
  document.querySelectorAll(STRIP).forEach((el: Element) => el.remove());

  const parsed = new Readability(document as unknown as Document, { charThreshold: 300, keepClasses: false }).parse();
  if (!parsed?.content) return null;
  const text = (parsed.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
  const words = text.split(/\s+/).length;
  return {
    title: parsed.title ?? "",
    byline: parsed.byline && !/contributors to wiki/i.test(parsed.byline) ? parsed.byline : undefined,
    siteName: parsed.siteName ?? undefined,
    // o HTML vai para um WebView sem JavaScript; mesmo assim, nada de atributos de evento
    html: parsed.content.replace(/\son\w+="[^"]*"/gi, "").replace(/\sstyle="[^"]*"/gi, ""),
    text,
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
