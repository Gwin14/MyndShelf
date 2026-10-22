import type { CaptureItem } from "@myndshelf/types";
import { youtubeId } from "./kinds";

export interface Embed {
  /** video: player 16:9 · audio: player de altura fixa */
  type: "video" | "audio";
  src: string;
  height?: number;
  provider: string;
}

/** URL de player incorporável para links de vídeo/áudio conhecidos. */
export function getEmbed(url?: string): Embed | undefined {
  if (!url) return undefined;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname;

  const yt = youtubeId(url);
  if (yt) {
    const start = u.searchParams.get("t")?.replace(/s$/, "");
    return {
      type: "video",
      provider: "YouTube",
      src: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0&modestbranding=1${start ? `&start=${parseInt(start, 10)}` : ""}`,
    };
  }

  const vimeo = host.endsWith("vimeo.com") && path.match(/\/(?:video\/)?(\d+)/)?.[1];
  if (vimeo) return { type: "video", provider: "Vimeo", src: `https://player.vimeo.com/video/${vimeo}?autoplay=1&dnt=1` };

  const dm = host.endsWith("dailymotion.com") && path.match(/\/video\/([a-z0-9]+)/i)?.[1];
  if (dm) return { type: "video", provider: "Dailymotion", src: `https://www.dailymotion.com/embed/video/${dm}?autoplay=1` };

  if (host === "open.spotify.com") {
    const m = path.match(/\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/);
    if (m) {
      const tall = m[1] !== "track" && m[1] !== "episode";
      return {
        type: "audio",
        provider: "Spotify",
        src: `https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0`,
        height: tall ? 452 : 232,
      };
    }
  }

  if (host === "music.apple.com" || host === "podcasts.apple.com") {
    return {
      type: "audio",
      provider: host === "podcasts.apple.com" ? "Apple Podcasts" : "Apple Music",
      // theme=dark: o player da Apple segue o tema claro do sistema por padrão
      src: `https://embed.${host}${path}?${new URLSearchParams([...u.searchParams, ["theme", "dark"]])}`,
      height: path.includes("/song/") || u.searchParams.has("i") ? 175 : 450,
    };
  }

  if (host === "soundcloud.com") {
    return {
      type: "audio",
      provider: "SoundCloud",
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ffb43d&auto_play=true&visual=true`,
      height: 400,
    };
  }

  if (host.endsWith("deezer.com")) {
    const m = path.match(/\/(track|album|playlist|episode|show)\/(\d+)/);
    if (m) return { type: "audio", provider: "Deezer", src: `https://widget.deezer.com/widget/dark/${m[1]}/${m[2]}`, height: 400 };
  }

  return undefined;
}

export type ViewMode = "play" | "read" | "image";

/** Como um item pode ser aberto dentro do app (ou undefined se só no navegador). */
export function viewModeOf(item: CaptureItem): ViewMode | undefined {
  if (getEmbed(item.url)) return "play";
  if (item.kind === "image" && item.image) return "image";
  if (item.url && ["article", "code", "link"].includes(item.kind)) return "read";
  return undefined;
}

export const VIEW_LABELS: Record<ViewMode, string> = {
  play: "Reproduzir",
  read: "Ler",
  image: "Ver",
};
