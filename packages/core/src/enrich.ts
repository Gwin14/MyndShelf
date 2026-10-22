import type { CaptureItem, PlaceInfo } from "@myndshelf/types";
import { detectKind, hostOf, youtubeId } from "./kinds";
import { parseOpenGraph } from "./opengraph";
import { improveImage, siteDetails, type SiteDetails } from "./sites";
import { isShortMapUrl, parsePlaceUrl, placeTitle, resolvePlace } from "./places";
import { cleanGameTitle, gameStoreOf, lookupGame, sameGame, steamDetails, type GameDetails } from "./games";

/** Cada plataforma fornece seu jeito de baixar HTML (Tauri/Rust, servidor, RN…). */
export type HtmlFetcher = (url: string) => Promise<string>;

export type CaptureEnrichment = Pick<
  CaptureItem,
  "kind" | "title" | "description" | "image" | "siteName" | "favicon" | "author" | "place"
>;

function cleanTitle(title: string | undefined, siteName: string | undefined): string | undefined {
  if (!title) return undefined;
  let t = title.trim();
  if (siteName) t = t.replace(new RegExp(`\\s*[|·—–-]\\s*${siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "");
  return t
    .replace(/\s*[|·–—-]\s*(Spotify|YouTube|Goodreads|Letterboxd|Wikipedia|Wikipédia)\s*$/i, "")
    .replace(/^(Listen to|Ouça|Escute|GitHub\s+-)\s+/i, "")
    .replace(/^Amazon\.[a-z.]+:\s*/i, "")
    .replace(/\s*[|:]\s*Amazon\.[a-z.]+.*$/i, "");
}

/** "Disco - Album by Artista" → título e autor separados (Spotify, Apple Music…). */
function splitByline(title: string): { title: string; author?: string } {
  const m = title.match(/^(.+?)\s+[-–—]\s+(?:Album|Single|Song|EP|Playlist|Podcast|Episode|Álbum|Música)\s+(?:by|de|por)\s+(.+)$/i);
  if (m) return { title: m[1], author: m[2] };
  // Apple Music: "Disco by Artista on Apple Music"
  const apple = title.match(/^(.+?)\s+(?:by|de|por)\s+(.+?)\s+(?:on|no|en)\s+Apple\s+Music$/i);
  return apple ? { title: apple[1], author: apple[2] } : { title };
}

/** Baixa a página, lê OpenGraph e decide o tipo de capa. */
export async function enrichLink(url: string, fetchHtml: HtmlFetcher): Promise<CaptureEnrichment> {
  const host = hostOf(url);
  let og = {};
  let site: SiteDetails = {};
  try {
    const html = await fetchHtml(url);
    og = parseOpenGraph(html, url);
    site = siteDetails(url, html);
  } catch {
    /* sem rede ou bloqueado — seguimos só com a URL */
  }
  const data = og as ReturnType<typeof parseOpenGraph>;
  // páginas de lugares (Foursquare, Yelp, TripAdvisor…) publicam a coordenada no OpenGraph
  const geo = data.latitude != null ? { lat: data.latitude, lng: data.longitude } : undefined;
  const detected = site.kind ?? detectKind(url, data);
  const kind = geo && ["link", "article"].includes(detected) ? "place" : detected;
  const yt = youtubeId(url);

  const byline = splitByline(site.title ?? (cleanTitle(data.title, data.siteName) || host || url));

  if (kind === "game") return enrichGame(url, fetchHtml, { ...data, title: byline.title });

  return {
    kind,
    title: byline.title,
    description: data.description,
    image: site.image ?? improveImage(data.image) ?? (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : kind === "image" ? url : undefined),
    siteName: data.siteName ?? host,
    favicon: data.favicon,
    author: site.author ?? byline.author ?? data.author,
    place: geo ? { ...geo, name: byline.title, provider: data.siteName ?? host } : undefined,
  };
}

/** Jogos: nome do link + Steam/Wikipédia quando a loja não entrega metadados. */
async function enrichGame(
  url: string,
  fetchText: HtmlFetcher,
  og: ReturnType<typeof parseOpenGraph>,
): Promise<CaptureEnrichment> {
  const store = gameStoreOf(url);
  let ogTitle = cleanGameTitle(og.title);
  let ogAuthor: string | undefined;
  // itch.io: "Celeste Classic by Maddy Makes Games"
  const by = store?.label === "itch.io" ? ogTitle?.match(/^(.+?) by (.+)$/) : null;
  if (by) [, ogTitle, ogAuthor] = by;
  // títulos genéricos ("Best Video games, DRM-free") não citam o jogo do link
  const firstWord = store?.name?.split(" ")[0]?.toLowerCase();
  const ogUseful = !!ogTitle && (!firstWord || ogTitle.toLowerCase().includes(firstWord));

  let details: GameDetails | undefined;
  try {
    if (store?.steamId) details = await steamDetails(store.steamId, fetchText);
    else if (!ogUseful) {
      if (store?.name) details = await lookupGame(store.name, fetchText);
    } else if (!og.image) {
      // título bom, sem capa: só aproveita a busca se for exatamente o mesmo jogo
      const found = await lookupGame(ogTitle!, fetchText);
      if (sameGame(found?.title, ogTitle)) details = { ...found, title: undefined };
    }
  } catch {
    /* fica com o OpenGraph */
  }

  // nome vindo do slug do link ("hollow knight") ganha maiúsculas
  const fromSlug = store?.name?.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  const title = details?.title ?? (ogUseful ? ogTitle : undefined) ?? fromSlug ?? hostOf(url);
  return {
    kind: "game",
    title,
    description: details?.description ?? og.description,
    image: details?.image ?? (ogUseful ? improveImage(og.image) : undefined),
    siteName: store?.label ?? og.siteName ?? hostOf(url),
    favicon: og.favicon,
    author: [details?.developer ?? ogAuthor, details?.year].filter(Boolean).join(" · ") || undefined,
  };
}

/**
 * Links de mapa (Google, Apple, OSM, Waze, links curtos de compartilhar…) e
 * coordenadas viram um lugar: coordenada exata, nome e endereço.
 */
export async function enrichPlace(
  url: string,
  fetchText: HtmlFetcher,
  resolveUrl?: (url: string) => Promise<string>,
): Promise<CaptureEnrichment> {
  let finalUrl = url;
  if (resolveUrl && isShortMapUrl(url)) finalUrl = await resolveUrl(url).catch(() => url);

  let info: PlaceInfo = parsePlaceUrl(finalUrl) ?? {};
  if (info.lat == null && !info.query && !info.name) {
    // link sem lugar legível (ex.: ?cid=…): o título da página costuma ser o nome
    try {
      const og = parseOpenGraph(await fetchText(finalUrl), finalUrl);
      if (og.latitude != null) Object.assign(info, { lat: og.latitude, lng: og.longitude });
      const t = og.title?.split(/\s+[·|–-]\s+/)[0];
      if (t && !/^(google maps|apple maps|maps)$/i.test(t)) info.query = t;
    } catch {
      /* segue sem */
    }
  }
  info = await resolvePlace(info, fetchText);

  return {
    kind: "place",
    title: placeTitle(info),
    description: info.address,
    siteName: info.provider,
    place: info,
  };
}

export function placeFromCoordinates(lat: number, lng: number, fetchText: HtmlFetcher): Promise<PlaceInfo> {
  return resolvePlace({ lat, lng, provider: "Coordenadas" }, fetchText);
}
