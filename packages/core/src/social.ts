import type { SocialFormat, SocialInfo, SocialMedia, SocialNetwork } from "@myndshelf/types";
import { decodeEntities } from "./opengraph";
import { hostOf } from "./kinds";

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  x: "X",
  threads: "Threads",
  reddit: "Reddit",
  instagram: "Instagram",
};

export const SOCIAL_FORMAT_LABELS: Record<SocialFormat, string> = {
  post: "Post",
  carousel: "Carrossel",
  image: "Foto",
  video: "Vídeo",
  reel: "Reel",
};

/** 12,3 mil → "12,3 mil"; 1 234 567 → "1,2 mi" — para contadores curtos. */
export function formatCount(n?: number): string | undefined {
  if (n == null) return undefined;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")} mi`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")} mil`;
  return String(n);
}

export function socialNetworkOf(url?: string): SocialNetwork | undefined {
  const host = hostOf(url);
  if (/(^|\.)(x|twitter)\.com$/.test(host)) return "x";
  if (/(^|\.)threads\.net$/.test(host)) return "threads";
  if (/(^|\.)reddit\.com$/.test(host)) return "reddit";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  return undefined;
}

/** Todos os valores de uma meta tag (og:image pode vir várias vezes em carrossel). */
function metaAll(html: string, key: string): string[] {
  const head = html.slice(0, html.search(/<\/head>/i) > 0 ? html.search(/<\/head>/i) : 300_000);
  const out: string[] = [];
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const prop = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (prop === key && content) out.push(decodeEntities(content[1] ?? content[2] ?? "").trim());
  }
  return [...new Set(out.filter(Boolean))];
}

/** "1,2 mil", "3.4K", "1.234" → número. Sem sufixo, pontos e vírgulas são separadores de milhar. */
export function parseCount(s?: string): number | undefined {
  const m = s?.trim().match(/^([\d.,]+)\s*([kKmM]|mil)?$/);
  if (!m) return undefined;
  // "mil" e "K" são milhares; só "M" é milhão ("mil" também tem um m)
  const thousands = !!m[2] && /^(k|mil)$/i.test(m[2]);
  const n = m[2] ? parseFloat(m[1].replace(",", ".")) * (thousands ? 1e3 : 1e6) : parseInt(m[1].replace(/[.,]/g, ""), 10);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

/** oEmbed público do Reddit: título e autor, mesmo quando a página pede verificação. */
export function redditOembedUrl(url: string): string {
  return `https://www.reddit.com/oembed?url=${encodeURIComponent(url)}`;
}

export function parseRedditOembed(raw: string): { title?: string; author?: string } | undefined {
  try {
    const o = JSON.parse(raw) as { title?: string; author_name?: string };
    return { title: o.title || undefined, author: o.author_name || undefined };
  } catch {
    return undefined;
  }
}

/** Tuítes públicos pelo endpoint de incorporação — o mesmo que os embeds usam. */
export function xSyndicationUrl(url: string): string | undefined {
  const id = url.match(/\/status\/(\d+)/)?.[1];
  if (!id) return undefined;
  const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
  return `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=pt&token=${token}`;
}

interface XTweet {
  text?: string;
  created_at?: string;
  favorite_count?: number;
  conversation_count?: number;
  user?: { name?: string; screen_name?: string; profile_image_url_https?: string };
  photos?: { url: string; width?: number; height?: number }[];
  video?: { poster?: string; variants?: { type?: string; src?: string; bitrate?: number }[] };
}

/** JSON do endpoint de tuítes → post pronto para exibir; undefined se o tuíte não existe. */
export function parseXTweet(raw: string): SocialInfo | undefined {
  let t: XTweet;
  try {
    t = JSON.parse(raw) as XTweet;
  } catch {
    return undefined;
  }
  if (!t?.user?.screen_name) return undefined;

  const media: SocialMedia[] = (t.photos ?? []).map((p) => ({ type: "image", url: p.url, width: p.width, height: p.height }));
  const video = t.video?.variants?.filter((v) => v.type === "video/mp4" && v.src).sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
  if (video?.src) media.push({ type: "video", url: video.src, poster: t.video?.poster });

  // o link curto do próprio tuíte (t.co) que anuncia a mídia não é texto
  const text = media.length ? t.text?.replace(/\s*https:\/\/t\.co\/\w+$/, "") : t.text;
  const avatar = t.user.profile_image_url_https?.replace("_normal", "_400x400");
  return {
    network: "x",
    format: video ? "video" : media.length > 1 ? "carousel" : "post",
    name: t.user.name,
    handle: t.user.screen_name,
    avatar,
    text: text?.trim() || undefined,
    media,
    likes: t.favorite_count,
    replies: t.conversation_count,
    publishedAt: t.created_at ? Date.parse(t.created_at) || undefined : undefined,
  };
}

/** Instagram: "12 mil curtidas, 3 comentários - usuario em 1 de março de 2024: "legenda"" */
const IG_DESCRIPTION = /^([\d.,]+\s*[kKmM]?|[\d.,]+\s*mil)\s+(?:likes?|curtidas?)(?:,\s*([\d.,]+\s*[kKmM]?|[\d.,]+\s*mil)\s+(?:comments?|comentários?|comentarios?))?\s*-\s*/i;

/** Lê um post pelo que a própria página publica (OpenGraph), sem depender do JS da rede. */
export function parseSocialHtml(network: SocialNetwork, url: string, html: string): SocialInfo {
  const ogTitle = metaAll(html, "og:title")[0] ?? "";
  const ogDesc = metaAll(html, "og:description")[0] ?? metaAll(html, "description")[0];
  // Threads: "Nome (@usuario) …"; Instagram: "Nome no Instagram: …" e o @ vem na URL ou na descrição
  const who = ogTitle.match(/^(.+?)\s*\(@([\w.]+)\)/);
  const igName = network === "instagram" ? ogTitle.match(/^(.+?)\s+(?:no|on)\s+Instagram\b/i)?.[1] : undefined;
  const igHandle =
    network === "instagram"
      ? metaAll(html, "og:url")[0]?.match(/instagram\.com\/([\w.]+)\/(?:p|reels?|tv)\//)?.[1] ??
        ogDesc?.match(/-\s+([\w.]+)\s+(?:no|on)\s/i)?.[1]
      : undefined;
  const videoUrl = metaAll(html, "og:video:secure_url")[0] ?? metaAll(html, "og:video")[0] ?? metaAll(html, "og:video:url")[0];
  // og:image e og:image:secure_url repetem a mesma foto; compara sem a query, mas guarda a URL inteira:
  // no CDN do Instagram a query é a assinatura (sem ela a imagem responde 403)
  const byPath = new Map<string, string>();
  for (const u of metaAll(html, "og:image:secure_url").concat(metaAll(html, "og:image"))) {
    if (!byPath.has(u.split("?")[0])) byPath.set(u.split("?")[0], u);
  }
  const images = [...byPath.values()];
  const media: SocialMedia[] = [
    ...images.map((u) => ({ type: "image" as const, url: u })),
    ...(videoUrl ? [{ type: "video" as const, url: videoUrl }] : []),
  ];

  let text = ogDesc;
  let likes: number | undefined;
  let replies: number | undefined;
  if (network === "instagram" && ogDesc) {
    const stats = ogDesc.match(IG_DESCRIPTION);
    if (stats) {
      likes = parseCount(stats[1]);
      replies = parseCount(stats[2]);
      // a legenda vem entre aspas depois de "usuário em <data>:"
      text = ogDesc
        .slice(stats[0].length)
        .replace(/^[^"“]*?:\s*/, "")
        .replace(/^["“]|["”]\.?\s*$/g, "");
    }
  }

  const community = network === "reddit" ? url.match(/\/r\/([^/]+)/)?.[1] : undefined;
  return {
    network,
    format: formatOf(network, url, !!videoUrl, images.length),
    name: who?.[1]?.trim() ?? igName?.trim() ?? igHandle,
    handle: who?.[2] ?? igHandle,
    text: text || undefined,
    community,
    media,
    likes,
    replies,
    publishedAt: network === "instagram" ? igDate(ogDesc) : undefined,
  };
}

/** Perfil do Instagram: a página pública traz a foto de perfil no og:image. */
export function instagramProfileUrl(handle: string): string {
  return `https://www.instagram.com/${handle}/`;
}

export function parseInstagramAvatar(html: string): string | undefined {
  return metaAll(html, "og:image")[0];
}

/** "…no October 25, 2026: …" → data da publicação (só formatos que o JavaScript entende). */
function igDate(desc?: string): number | undefined {
  const raw = desc?.match(/\sno\s+([A-Za-z]+ \d{1,2}, \d{4}|\d{1,2} de [a-zçé]+ de \d{4})\s*:/i)?.[1];
  const time = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(time) ? time : undefined;
}

function formatOf(network: SocialNetwork, url: string, hasVideo: boolean, imageCount: number): SocialFormat {
  if (network === "instagram" && /\/reels?\//.test(new URL(url).pathname)) return "reel";
  if (hasVideo) return "video";
  if (imageCount > 1) return "carousel";
  return "post";
}
