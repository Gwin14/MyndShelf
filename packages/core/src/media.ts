import type { CreationMedium } from "@myndshelf/types";

export function mediumFromFile(name: string, mime = ""): CreationMedium {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime.startsWith("image/") || /^(png|jpe?g|gif|webp|avif|heic|tiff?|bmp|svg|psd)$/.test(ext)) return "image";
  if (mime.startsWith("audio/") || /^(mp3|wav|flac|aiff?|ogg|m4a|opus)$/.test(ext)) return "audio";
  if (mime.startsWith("video/") || /^(mp4|mov|webm|mkv|avi|m4v)$/.test(ext)) return "video";
  if (/^(pdf|epub|docx?|pages|key|pptx?)$/.test(ext)) return "document";
  if (mime.startsWith("text/") || /^(txt|md|rtf|json|html?)$/.test(ext)) return "text";
  return "object";
}

export const MEDIUM_LABELS: Record<CreationMedium, string> = {
  image: "Imagem",
  document: "Documento",
  audio: "Áudio",
  video: "Vídeo",
  text: "Texto",
  object: "Objeto",
};

export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}
