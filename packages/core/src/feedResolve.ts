import { discoverFeedUrl, looksLikeFeed } from "./feed";
import { normalizeUrl } from "./kinds";

export type TextFetcher = (url: string) => Promise<string>;

export interface FeedSource {
  /** Como o app descreve o que encontrou: "Canal do YouTube", "Subreddit r/space"… */
  label: string;
  /** URLs de feed deduzidas só pelo formato do link, em ordem de preferência. */
  candidates?: string[];
  /** Quando o link sozinho não basta: lê a página (ou uma API) para achar o feed. */
  resolve?: (page: string, fetchText: TextFetcher) => Promise<string | undefined>;
  /** Site sem RSS público — explica em vez de tentar. */
  unsupported?: string;
}

type Rule = (u: URL, host: string, parts: string[]) => FeedSource | undefined;

const YT_FEED = "https://www.youtube.com/feeds/videos.xml";

/** Acha o id UC… de um canal em qualquer página do YouTube (canal, @handle, vídeo). */
function youtubeChannelId(page: string): string | undefined {
  return (
    page.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ??
    page.match(/channel_id=(UC[\w-]{22})/)?.[1] ??
    page.match(/"channelId":"(UC[\w-]{22})"/)?.[1] ??
    page.match(/<meta itemprop="(?:channelId|identifier)" content="(UC[\w-]{22})"/)?.[1]
  );
}

const RULES: Rule[] = [
  // ── YouTube ──
  (u, host, parts) => {
    if (!/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return;
    const list = u.searchParams.get("list");
    if (list && !u.searchParams.get("v")) return { label: "Playlist do YouTube", candidates: [`${YT_FEED}?playlist_id=${list}`] };
    if (parts[0] === "channel" && parts[1]) return { label: "Canal do YouTube", candidates: [`${YT_FEED}?channel_id=${parts[1]}`] };
    if (parts[0] === "user" && parts[1]) {
      return {
        label: "Canal do YouTube",
        candidates: [`${YT_FEED}?user=${parts[1]}`],
        resolve: async (page) => {
          const id = youtubeChannelId(page);
          return id && `${YT_FEED}?channel_id=${id}`;
        },
      };
    }
    const isVideo = host === "youtu.be" || parts[0] === "watch" || parts[0] === "shorts" || parts[0] === "live";
    return {
      label: isVideo ? "Canal do YouTube (a partir do vídeo)" : "Canal do YouTube",
      resolve: async (page) => {
        const id = youtubeChannelId(page);
        return id && `${YT_FEED}?channel_id=${id}`;
      },
    };
  },

  // ── Reddit ──
  (u, host, parts) => {
    if (!/(^|\.)reddit\.com$/.test(host)) return;
    if (parts[0] === "r" && parts[1]) {
      const sort = ["top", "new", "hot", "rising"].includes(parts[2]) ? `${parts[2]}/` : "";
      return { label: `Subreddit r/${parts[1]}`, candidates: [`https://www.reddit.com/r/${parts[1]}/${sort}.rss`] };
    }
    if ((parts[0] === "u" || parts[0] === "user") && parts[1]) {
      return { label: `Perfil u/${parts[1]} no Reddit`, candidates: [`https://www.reddit.com/user/${parts[1]}/.rss`] };
    }
    return { label: "Reddit", candidates: ["https://www.reddit.com/.rss"] };
  },

  // ── GitHub ──
  (_u, host, parts) => {
    if (host !== "github.com" || !parts[0]) return;
    if (parts[1]) {
      const repo = `${parts[0]}/${parts[1]}`;
      return {
        label: `Lançamentos de ${repo}`,
        candidates: [`https://github.com/${repo}/releases.atom`, `https://github.com/${repo}/commits.atom`],
      };
    }
    return { label: `Atividade de @${parts[0]} no GitHub`, candidates: [`https://github.com/${parts[0]}.atom`] };
  },

  // ── Medium, Substack, Tumblr, WordPress, Blogger ──
  (u, host, parts) => {
    if (host === "medium.com" && parts[0]) return { label: `Medium · ${parts[0]}`, candidates: [`https://medium.com/feed/${parts[0]}`] };
    if (host.endsWith(".medium.com")) return { label: "Blog no Medium", candidates: [`${u.origin}/feed`] };
    if (host.endsWith(".substack.com")) return { label: "Newsletter no Substack", candidates: [`${u.origin}/feed`] };
    if (host.endsWith(".tumblr.com")) return { label: "Tumblr", candidates: [`${u.origin}/rss`] };
    if (host.endsWith(".wordpress.com")) return { label: "Blog no WordPress", candidates: [`${u.origin}/feed/`] };
    if (host.endsWith(".blogspot.com")) return { label: "Blog no Blogger", candidates: [`${u.origin}/feeds/posts/default?alt=rss`] };
  },

  // ── Bluesky ──
  (_u, host, parts) => {
    if (host !== "bsky.app" || parts[0] !== "profile" || !parts[1]) return;
    const handle = parts[1];
    if (handle.startsWith("did:")) return { label: "Perfil no Bluesky", candidates: [`https://bsky.app/profile/${handle}/rss`] };
    return {
      label: `Perfil @${handle} no Bluesky`,
      resolve: async (_page, fetchText) => {
        const json = await fetchText(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
        const did = json.match(/"did"\s*:\s*"(did:[^"]+)"/)?.[1];
        return did && `https://bsky.app/profile/${did}/rss`;
      },
    };
  },

  // ── Letterboxd, Vimeo, dev.to, Pinterest, Are.na ──
  (_u, host, parts) => {
    if (host === "letterboxd.com" && parts[0] && !["film", "list", "films", "lists", "members", "journal"].includes(parts[0])) {
      return { label: `Diário de ${parts[0]} no Letterboxd`, candidates: [`https://letterboxd.com/${parts[0]}/rss/`] };
    }
    if (host === "vimeo.com" && parts[0] && !/^\d+$/.test(parts[0])) {
      if (parts[0] === "channels" && parts[1]) return { label: "Canal no Vimeo", candidates: [`https://vimeo.com/channels/${parts[1]}/videos/rss`] };
      return { label: `Vídeos de ${parts[0]} no Vimeo`, candidates: [`https://vimeo.com/${parts[0]}/videos/rss`] };
    }
    if (host === "dev.to" && parts[0]) return { label: `dev.to · ${parts[0]}`, candidates: [`https://dev.to/feed/${parts[0]}`] };
    if (/(^|\.)pinterest\.[a-z.]+$/.test(host) && parts[0]) {
      if (parts[1]) return { label: "Pasta no Pinterest", candidates: [`https://www.pinterest.com/${parts[0]}/${parts[1]}.rss`] };
      return { label: `Pins de ${parts[0]}`, candidates: [`https://www.pinterest.com/${parts[0]}/feed.rss`] };
    }
    if (host === "are.na" && parts[0] && parts[1]) {
      return { label: "Canal no Are.na", candidates: [`https://www.are.na/${parts[0]}/${parts[1]}/feed/rss`] };
    }
  },

  // ── Agregadores ──
  (u, host, parts) => {
    if (host === "news.ycombinator.com") {
      const id = u.searchParams.get("id");
      if (parts[0] === "item" && id) return { label: "Comentários no Hacker News", candidates: [`https://hnrss.org/item?id=${id}`] };
      const map: Record<string, string> = { newest: "newest", show: "show", ask: "ask", best: "best", front: "frontpage" };
      return { label: "Hacker News", candidates: [`https://hnrss.org/${map[parts[0]] ?? "frontpage"}`] };
    }
    if (host === "lobste.rs") return { label: "Lobsters", candidates: ["https://lobste.rs/rss"] };
  },

  // ── Podcasts e áudio ──
  (u, host, parts) => {
    if (host === "podcasts.apple.com") {
      const id = u.pathname.match(/id(\d+)/)?.[1];
      if (!id) return;
      return {
        label: "Podcast (via Apple Podcasts)",
        resolve: async (_page, fetchText) => {
          const json = await fetchText(`https://itunes.apple.com/lookup?id=${id}&entity=podcast`);
          return json.match(/"feedUrl"\s*:\s*"([^"]+)"/)?.[1];
        },
      };
    }
    if (host === "soundcloud.com" && parts[0]) {
      return {
        label: `Faixas de ${parts[0]} no SoundCloud`,
        resolve: async (page) => {
          const id = page.match(/soundcloud:\/\/users:(\d+)/)?.[1];
          return id && `https://feeds.soundcloud.com/users/soundcloud:users:${id}/sounds.rss`;
        },
      };
    }
    if (host === "open.spotify.com" && /^(show|episode)$/.test(parts[0] ?? "")) {
      return {
        label: "Podcast no Spotify",
        unsupported: "O Spotify não publica RSS dos podcasts. Procure o mesmo podcast no Apple Podcasts e cole o link de lá.",
      };
    }
  },

  // ── Sem RSS público ──
  (_u, host) => {
    const closed: Record<string, string> = {
      "x.com": "X/Twitter",
      "twitter.com": "X/Twitter",
      "instagram.com": "Instagram",
      "tiktok.com": "TikTok",
      "threads.net": "Threads",
      "facebook.com": "Facebook",
      "linkedin.com": "LinkedIn",
    };
    const name = closed[host.replace(/^(www|m)\./, "")];
    if (name) return { label: name, unsupported: `O ${name} não oferece feed RSS público.` };
  },
  // ── Fediverso (Mastodon, Pixelfed…): qualquer domínio com /@usuario ──
  (u, _host, parts) => {
    if (parts.length === 1 && /^@[\w.]+$/.test(parts[0])) {
      return { label: `Perfil ${parts[0]} no Fediverso`, candidates: [`${u.origin}/${parts[0]}.rss`] };
    }
  },

];

/** O que o link parece ser, sem acessar a rede — usado para dar uma dica enquanto a pessoa digita. */
export function describeFeedSource(input: string): FeedSource | undefined {
  let u: URL;
  try {
    u = new URL(normalizeUrl(input));
  } catch {
    return undefined;
  }
  const host = u.hostname.replace(/^www\./, "");
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  for (const rule of RULES) {
    const src = rule(u, host, parts);
    if (src) return src;
  }
  return undefined;
}

/** Caminhos onde blogs costumam publicar o feed. */
const COMMON_PATHS = ["/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml", "/index.xml", "/feed/", "/blog/feed", "/blog/rss.xml"];

export interface FoundFeed {
  url: string;
  text: string;
  /** Como foi encontrado — para mostrar à pessoa. */
  via: string;
}

/**
 * Transforma qualquer link em um feed: o próprio feed, um formato conhecido
 * (YouTube, Reddit, GitHub, Medium…), o <link rel="alternate"> da página
 * ou, por último, os caminhos comuns de blogs.
 */
export async function findFeed(input: string, fetchText: TextFetcher): Promise<FoundFeed> {
  const url = normalizeUrl(input);
  const src = describeFeedSource(url);
  if (src?.unsupported) throw new Error(src.unsupported);

  const tried = new Set<string>();
  const attempt = async (candidate: string | undefined, via: string): Promise<FoundFeed | undefined> => {
    if (!candidate || tried.has(candidate)) return;
    tried.add(candidate);
    try {
      const text = await fetchText(candidate);
      if (looksLikeFeed(text)) return { url: candidate, text, via };
    } catch {
      /* próximo candidato */
    }
  };

  for (const c of src?.candidates ?? []) {
    const hit = await attempt(c, src!.label);
    if (hit) return hit;
  }

  let page = "";
  try {
    page = await fetchText(url);
  } catch {
    /* página fora do ar — ainda dá para tentar os caminhos comuns */
  }
  tried.add(url);
  if (looksLikeFeed(page)) return { url, text: page, via: "Feed" };

  if (src?.resolve) {
    const hit = await attempt(await src.resolve(page, fetchText).catch(() => undefined), src.label);
    if (hit) return hit;
  }

  const discovered = await attempt(page ? discoverFeedUrl(page, url) : undefined, src?.label ?? "Feed do site");
  if (discovered) return discovered;

  const origin = new URL(url).origin;
  const common = await Promise.all(COMMON_PATHS.map((p) => attempt(origin + p, "Feed do site")));
  const hit = common.find(Boolean);
  if (hit) return hit;

  throw new Error(src ? `Não encontrei o feed (${src.label}).` : "Nenhum feed RSS ou Atom encontrado nesse endereço.");
}
