import type { CaptureKind, OpenGraphData } from "@myndshelf/types";

interface Rule {
  kind: CaptureKind;
  host?: RegExp;
  path?: RegExp;
  ogType?: RegExp;
  text?: RegExp;
}

/** Ordem importa: a primeira regra que bate vence. */
const RULES: Rule[] = [
  { kind: "podcast", host: /open\.spotify\.com$/, path: /^\/(intl-[a-z]+\/)?(episode|show)\// },
  { kind: "podcast", host: /(podcasts\.apple\.com|overcast\.fm|pca\.st|pocketcasts\.com)$/ },
  { kind: "music", host: /(open\.spotify\.com|music\.apple\.com|bandcamp\.com|soundcloud\.com|music\.youtube\.com|deezer\.com|tidal\.com|last\.fm|discogs\.com|rateyourmusic\.com)$/ },
  { kind: "music", ogType: /^music\./ },
  { kind: "film", host: /(letterboxd\.com|imdb\.com|themoviedb\.org|filmow\.com|mubi\.com)$/, path: /\/(film|title|movie|filme)s?\// },
  { kind: "film", ogType: /^video\.(movie|tv_show)/ },
  { kind: "book", host: /(goodreads\.com|openlibrary\.org|skoob\.com\.br|bookshop\.org|storygraph\.com)$/ },
  { kind: "book", host: /books\.google\./ },
  { kind: "book", ogType: /^books?(\.|$)/ },
  { kind: "book", host: /amazon\.|estantevirtual\.com\.br$/, text: /\b(livro|book|paperback|hardcover|capa (comum|dura)|kindle|ebook)\b/i },
  { kind: "video", host: /(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|tiktok\.com|nebula\.tv|dailymotion\.com)$/ },
  { kind: "video", ogType: /^video/ },
  { kind: "code", host: /(github\.com|gitlab\.com|codepen\.io|codesandbox\.io|npmjs\.com|huggingface\.co|stackblitz\.com)$/ },
  { kind: "place", host: /(maps\.apple\.com|openstreetmap\.org)$/ },
  { kind: "place", host: /google\.[a-z.]+$/, path: /^\/maps/ },
  { kind: "image", path: /\.(png|jpe?g|gif|webp|avif|svg)$/i },
  { kind: "image", host: /(pinterest\.[a-z.]+|dribbble\.com|behance\.net|unsplash\.com|are\.na|flickr\.com|cosmos\.so|savee\.it)$/ },
  { kind: "article", ogType: /^article/ },
  { kind: "article", host: /(medium\.com|substack\.com|wikipedia\.org|nytimes\.com|newyorker\.com|theguardian\.com|aeon\.co)$/ },
];

/** Detecta o tipo do item cruzando domínio, caminho, og:type e texto. */
export function detectKind(url: string, og: OpenGraphData = {}): CaptureKind {
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "");
    path = u.pathname;
  } catch {
    return "note";
  }
  const ogType = (og.type ?? "").toLowerCase();
  const text = `${og.title ?? ""} ${og.description ?? ""}`;

  for (const r of RULES) {
    if (r.host && !r.host.test(host)) continue;
    if (r.path && !r.path.test(path)) continue;
    if (r.ogType && !r.ogType.test(ogType)) continue;
    if (r.text && !r.text.test(text)) continue;
    return r.kind;
  }
  // Heurística: slugs longos tendem a ser textos
  if (/\/[a-z0-9]+(-[a-z0-9]+){3,}\/?$/i.test(path)) return "article";
  return "link";
}

export const KIND_LABELS: Record<CaptureKind, string> = {
  music: "Música",
  podcast: "Podcast",
  book: "Livro",
  video: "Vídeo",
  film: "Filme",
  article: "Leitura",
  image: "Imagem",
  code: "Código",
  place: "Lugar",
  note: "Nota",
  link: "Link",
};

export function youtubeId(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || undefined;
    if (/youtube\.com$/.test(u.hostname)) {
      return u.searchParams.get("v") ?? u.pathname.match(/\/(shorts|embed|live)\/([^/?]+)/)?.[2];
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function isProbablyUrl(input: string): boolean {
  const s = input.trim();
  if (/\s/.test(s)) return false;
  return /^https?:\/\//i.test(s) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(s);
}

export function normalizeUrl(input: string): string {
  const s = input.trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function hostOf(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
