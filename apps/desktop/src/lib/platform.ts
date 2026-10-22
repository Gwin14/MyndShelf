import { invoke } from "@tauri-apps/api/core";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Baixa HTML de uma URL — via Rust no desktop, via proxy do Vite no navegador. */
export async function fetchHtml(url: string): Promise<string> {
  if (isTauri) return invoke<string>("fetch_html", { url });
  const res = await fetch(`/__og?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.text();
}

/** Destino final de um link curto (segue redirecionamentos). */
export async function resolveUrl(url: string): Promise<string> {
  if (isTauri) return invoke<string>("resolve_url", { url });
  const res = await fetch(`/__resolve?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`resolve failed: ${res.status}`);
  return res.text();
}

export async function openExternal(url: string) {
  if (isTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    return openUrl(url);
  }
  window.open(url, "_blank", "noopener");
}
