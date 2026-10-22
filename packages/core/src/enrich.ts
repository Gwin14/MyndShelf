import type { CaptureItem } from "@myndshelf/types";
import { detectKind, hostOf, youtubeId } from "./kinds";
import { parseOpenGraph } from "./opengraph";
import { improveImage, siteDetails, type SiteDetails } from "./sites";

/** Cada plataforma fornece seu jeito de baixar HTML (Tauri/Rust, servidor, RN…). */
export type HtmlFetcher = (url: string) => Promise<string>;

export type CaptureEnrichment = Pick<
  CaptureItem,
  "kind" | "title" | "description" | "image" | "siteName" | "favicon" | "author"
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
  const kind = site.kind ?? detectKind(url, data);
  const yt = youtubeId(url);

  const byline = splitByline(site.title ?? (cleanTitle(data.title, data.siteName) || host || url));

  return {
    kind,
    title: byline.title,
    description: data.description,
    image: site.image ?? improveImage(data.image) ?? (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : kind === "image" ? url : undefined),
    siteName: data.siteName ?? host,
    favicon: data.favicon,
    author: site.author ?? byline.author ?? data.author,
  };
}
