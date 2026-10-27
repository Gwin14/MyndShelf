import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import { hostOf } from "@myndshelf/core";
import { fetchHtml } from "./platform";

export interface Chapter {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface ArticleLink {
  href: string;
  text: string;
  host: string;
}

export interface Article {
  title: string;
  byline?: string;
  siteName?: string;
  /** perfil do site aplicado (ex.: "wikipedia") — o CSS do leitor ajusta a tela por site */
  site?: string;
  html: string;
  minutes: number;
  chapters: Chapter[];
  /** links do texto, separados em "neste site" e "de fora" */
  links: { inside: ArticleLink[]; outside: ArticleLink[] };
}

/**
 * Ajustes por site. O leitor genérico funciona bem na maioria das páginas;
 * cada site que tem menus, notas ou widgets próprios ganha um perfil aqui.
 */
interface SiteProfile {
  name: string;
  match: RegExp;
  /** elementos tirados da página antes de extrair o texto */
  drop?: string;
  /** seções inteiras pelo título do cabeçalho (notas, referências…) */
  dropSections?: RegExp;
  /** mantém as classes do site (infobox, miniaturas…) para o CSS do leitor usar */
  keepClasses?: boolean;
  /** endereço usado no lugar do original (Wikipedia tem uma versão móvel limpa) */
  rewrite?: (url: URL) => void;
}

const SECTIONS_TO_DROP =
  /^(referências|referências bibliográficas|notas|notas e referências|bibliografia|fontes|ligações externas|leitura adicional|references|notes|bibliography|external links|further reading|sources)$/i;

const PROFILES: SiteProfile[] = [
  {
    name: "wikipedia",
    match: /(^|\.)wikipedia\.org$/,
    rewrite: (u) => {
      const wiki = u.hostname.match(/^([a-z-]+)\.(?:m\.)?wikipedia\.org$/);
      if (wiki) u.hostname = `${wiki[1]}.m.wikipedia.org`;
    },
    drop: [
      ".mw-editsection",
      ".mw-jump-link",
      ".mw-empty-elt",
      ".mw-cite-backlink",
      "sup.reference",
      ".reference",
      ".mw-references-wrap",
      ".reflist",
      ".refbegin",
      ".navbox",
      ".navbox-styles",
      ".hatnote",
      ".sistersitebox",
      ".metadata",
      ".ambox",
      ".portal",
      ".authority-control",
      ".catlinks",
      ".printfooter",
      ".noprint",
      "#toc",
      ".toc",
      ".vector-header",
    ].join(", "),
    dropSections: SECTIONS_TO_DROP,
    keepClasses: true,
  },
  {
    name: "substack",
    match: /(^|\.)substack\.com$/,
    drop: "[class*='subscription-widget'], [class*='subscribe-widget'], [class*='captioned-button'], [class*='post-footer'], footer",
  },
  {
    name: "medium",
    match: /(^|\.)medium\.com$/,
    drop: "button, form, [data-testid='postPageFooter'], [data-testid='speechButton']",
  },
];

const profileOf = (host: string) => PROFILES.find((p) => p.match.test(host));

/** Tira seções inteiras cujo cabeçalho bate com o padrão (ex.: "Referências"). */
function dropSections(doc: Document, pattern: RegExp) {
  for (const h of Array.from(doc.querySelectorAll("h2"))) {
    if (!pattern.test(h.textContent?.trim() ?? "")) continue;
    const section = h.closest("section");
    if (section) {
      section.remove();
      continue;
    }
    // sem <section>: apaga até o próximo cabeçalho do mesmo nível
    let node = h.nextElementSibling;
    while (node && node.tagName !== "H2") {
      const next = node.nextElementSibling;
      node.remove();
      node = next;
    }
    h.remove();
  }
}

/** Gera âncoras para os capítulos e separa os links em "neste site" e "de fora". */
function indexArticle(html: string, articleUrl: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const host = hostOf(articleUrl);
  const chapters: Chapter[] = [];

  doc.querySelectorAll("h2, h3").forEach((h, i) => {
    const text = h.textContent?.replace(/\s+/g, " ").trim();
    if (!text) return;
    const id = `cap-${i}`;
    h.id = id;
    chapters.push({ id, text, level: h.tagName === "H2" ? 2 : 3 });
  });

  // tabelas largas rolam dentro do próprio bloco, sem estourar a coluna do texto
  doc.querySelectorAll("table").forEach((t) => {
    if (t.classList.contains("infobox") || t.closest(".reader-table")) return;
    const wrap = doc.createElement("div");
    wrap.className = "reader-table";
    t.replaceWith(wrap);
    wrap.append(t);
  });

  const inside = new Map<string, ArticleLink>();
  const outside = new Map<string, ArticleLink>();
  doc.querySelectorAll("a[href]").forEach((a) => {
    const raw = a.getAttribute("href") ?? "";
    if (raw.startsWith("#")) return;
    let target: URL;
    try {
      target = new URL(raw, articleUrl);
    } catch {
      return;
    }
    if (!/^https?:$/.test(target.protocol)) return;
    const link = {
      href: target.toString(),
      text: a.textContent?.replace(/\s+/g, " ").trim() || target.hostname,
      host: target.hostname.replace(/^www\./, ""),
    };
    const bucket = link.host === host ? inside : outside;
    if (!bucket.has(link.href) && bucket.size < 150) bucket.set(link.href, link);
  });

  return {
    html: doc.body.innerHTML,
    chapters,
    links: { inside: [...inside.values()], outside: [...outside.values()] },
  };
}

const cache = new Map<string, Promise<Article | null>>();

async function extract(url: string): Promise<Article | null> {
  const profile = profileOf(hostOf(url));
  const target = new URL(url);
  profile?.rewrite?.(target);

  const raw = await fetchHtml(target.toString());
  const doc = new DOMParser().parseFromString(raw, "text/html");
  // Readability resolve links e imagens relativos a partir do <base>
  const base = doc.createElement("base");
  base.href = url;
  doc.head.prepend(base);

  if (profile?.drop) doc.querySelectorAll(profile.drop).forEach((el) => el.remove());
  if (profile?.dropSections) dropSections(doc, profile.dropSections);

  const parsed = new Readability(doc, { charThreshold: 300, keepClasses: !!profile?.keepClasses }).parse();
  if (!parsed?.content) return null;

  const clean = DOMPurify.sanitize(parsed.content, {
    FORBID_TAGS: ["style", "form", "input", "button", "iframe", "script"],
    FORBID_ATTR: ["style", "width", "height"],
  });
  const indexed = indexArticle(clean, url);
  const words = (parsed.textContent ?? "").trim().split(/\s+/).length;
  return {
    title: parsed.title ?? "",
    byline: parsed.byline && !/contributors to wiki/i.test(parsed.byline) ? parsed.byline : undefined,
    siteName: parsed.siteName ?? undefined,
    site: profile?.name,
    html: indexed.html,
    minutes: Math.max(1, Math.round(words / 220)),
    chapters: indexed.chapters,
    links: indexed.links,
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
