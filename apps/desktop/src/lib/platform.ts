import { invoke } from "@tauri-apps/api/core";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** No site servido pelo próprio servidor, o proxy de links pede o token. */
let serverHeaders: () => Record<string, string> = () => ({});
export const setServerHeaders = (fn: typeof serverHeaders) => (serverHeaders = fn);

/** Baixa HTML de uma URL — via Rust no desktop, via proxy do Vite no navegador. */
export async function fetchHtml(url: string): Promise<string> {
  if (isTauri) return invoke<string>("fetch_html", { url });
  const res = await fetch(`/__og?url=${encodeURIComponent(url)}`, { headers: serverHeaders() });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.text();
}

/** Destino final de um link curto (segue redirecionamentos). */
export async function resolveUrl(url: string): Promise<string> {
  if (isTauri) return invoke<string>("resolve_url", { url });
  const res = await fetch(`/__resolve?url=${encodeURIComponent(url)}`, { headers: serverHeaders() });
  if (!res.ok) throw new Error(`resolve failed: ${res.status}`);
  return res.text();
}

/* ───────────── arquivos e pastas arrastados (só no app desktop) ───────────── */

export interface PathInfo {
  name: string;
  isDir: boolean;
  size: number;
  modified?: number;
  items?: number;
  sample: string[];
}

export const pathInfo = (path: string) => invoke<PathInfo>("path_info", { path });

export async function readDroppedFile(path: string, name: string): Promise<File> {
  const bytes = await invoke<ArrayBuffer>("read_file", { path });
  return new File([bytes], name, { type: mimeFromName(name) });
}

/** Abre a pasta no Finder/Explorer; com reveal, mostra o arquivo selecionado. */
export const openPath = (path: string, reveal = false) => invoke<void>("open_path", { path, reveal });

export const FILE_MANAGER = /Mac/i.test(navigator.platform)
  ? "Finder"
  : /Win/i.test(navigator.platform)
    ? "Explorador de Arquivos"
    : "gerenciador de arquivos";

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml",
  mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", m4a: "audio/mp4", ogg: "audio/ogg",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  pdf: "application/pdf", txt: "text/plain", md: "text/markdown", html: "text/html", csv: "text/csv",
};
function mimeFromName(name: string): string {
  return MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "";
}

export type NativeDrop =
  | { type: "enter" | "over" | "leave" }
  | { type: "drop"; paths: string[] };

/** Arrastar do Finder para a janela: o Tauri entrega os caminhos de verdade. */
export async function onNativeDrop(handler: (e: NativeDrop) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  return getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === "drop") handler({ type: "drop", paths: payload.paths });
    else handler({ type: payload.type });
  });
}

export async function openExternal(url: string) {
  if (isTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    return openUrl(url);
  }
  window.open(url, "_blank", "noopener");
}
