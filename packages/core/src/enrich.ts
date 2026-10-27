import type { CaptureItem, CaptureKind, PlaceInfo, SocialInfo } from "@myndshelf/types";
import { detectKind, hostOf, youtubeId } from "./kinds";
import { parseOpenGraph } from "./opengraph";
import { improveImage, siteDetails, type SiteDetails } from "./sites";
import { isShortMapUrl, parsePlaceUrl, placeTitle, resolvePlace } from "./places";
import { formatPrice, productFromHtml, productStoreOf } from "./products";
import { cleanGameTitle, gameStoreOf, lookupGame, sameGame, steamDetails, type GameDetails } from "./games";
import { parseRedditOembed, parseSocialHtml, parseXTweet, redditOembedUrl, SOCIAL_LABELS, socialNetworkOf, xSyndicationUrl } from "./social";

/** Cada plataforma fornece seu jeito de baixar HTML (Tauri/Rust, servidor, RN…). */
export type HtmlFetcher = (url: string) => Promise<string>;

export type CaptureEnrichment = Pick<
  CaptureItem,
  "kind" | "title" | "description" | "image" | "siteName" | "favicon" | "author" | "place" | "product" | "social"
>;

/** Tipos que só viram "produto" quando nada mais específico bateu (livro, jogo, música… têm prioridade). */
const GENERIC_KINDS: CaptureKind[] = ["link", "article"];

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
  let html = "";
  try {
    html = await fetchHtml(url);
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
  if (kind === "social") return enrichSocial(url, fetchHtml, html, data);

  // produto de loja: só quando nenhum tipo com prioridade reconheceu o link
  if (GENERIC_KINDS.includes(kind) || (kind === "image" && site.product)) {
    const store = productStoreOf(url);
    const product = site.product ?? productFromHtml(html);
    if (store || product) {
      // página de bloqueio ("Access Denied", "Mercado Libre"…): o título não fala do produto do link
      const slugWord = store?.name?.toLowerCase().split(" ").find((w) => w.length > 3);
      const generic =
        !data.title ||
        data.title === host ||
        !!site.blocked ||
        (!!slugWord && !byline.title.toLowerCase().includes(slugWord));
      const title = product?.name ?? (generic ? store?.name : byline.title) ?? byline.title;
      return {
        kind: "product",
        title,
        description: product?.description ?? (generic ? undefined : data.description),
        image: product?.image ?? site.image ?? (generic ? undefined : improveImage(data.image)),
        siteName: store?.label ?? data.siteName ?? host,
        favicon: data.favicon,
        author: [product?.brand, formatPrice(product?.price, product?.currency)].filter(Boolean).join(" · ") || undefined,
        product: product
          ? { price: product.price, currency: product.currency, brand: product.brand, available: product.available, store: store?.label ?? data.siteName ?? host }
          : { store: store?.label ?? data.siteName ?? host },
      };
    }
  }

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

/** Posts: o texto e a mídia vêm da própria rede; o OpenGraph completa o que faltar. */
async function enrichSocial(
  url: string,
  fetchText: HtmlFetcher,
  html: string,
  og: ReturnType<typeof parseOpenGraph>,
): Promise<CaptureEnrichment> {
  const network = socialNetworkOf(url)!;
  let social: SocialInfo | undefined;
  const api = xSyndicationUrl(url);
  if (api) {
    try {
      social = parseXTweet(await fetchText(api));
    } catch {
      /* sem a API — fica com a página */
    }
  }
  social ??= parseSocialHtml(network, url, html);

  // o Reddit responde à página com um desafio anti-bot (sem texto): usamos o oEmbed público
  let oembedTitle: string | undefined;
  if (network === "reddit" && !social.text) {
    try {
      const o = parseRedditOembed(await fetchText(redditOembedUrl(url)));
      oembedTitle = o?.title;
      if (o?.author) social = { ...social, name: `u/${o.author}` };
    } catch {
      /* sem oEmbed — fica só com a URL */
    }
  }

  const label = SOCIAL_LABELS[network];
  const firstLine = social.text?.split("\n")[0].slice(0, 90);
  // no Reddit o título do post é o que importa (o og:title da página de desafio é só "Reddit")
  const title =
    network === "reddit"
      ? oembedTitle || og.title?.replace(/\s*:\s*r\/\w+$/, "") || firstLine || label
      : social.name
        ? `${social.name}${firstLine ? `: ${firstLine}` : ""}`
        : cleanTitle(og.title, og.siteName) || firstLine || label;

  const firstImage = social.media.find((m) => m.type === "image")?.url ?? social.media.find((m) => m.poster)?.poster;
  return {
    kind: "social",
    title,
    description: social.text,
    image: firstImage ?? improveImage(og.image),
    siteName: label,
    favicon: og.favicon,
    author: social.handle ? `${social.name ?? social.handle} · @${social.handle}` : social.name,
    social,
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
