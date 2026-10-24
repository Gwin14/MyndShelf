import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { colors } from "./theme";

/** Mesmo cabeçalho do leitor em Rust do desktop: os sites devolvem o mesmo OpenGraph. */
const HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; MyndShelfBot/0.1; link preview)",
  accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
};

function withTimeout(ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

/** No celular não há CORS: o fetch vai direto ao site. */
export async function fetchHtml(url: string): Promise<string> {
  const { signal, done } = withTimeout(12_000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    return await res.text();
  } finally {
    done();
  }
}

/** Destino final de um link curto (segue redirecionamentos). */
export async function resolveUrl(url: string): Promise<string> {
  const { signal, done } = withTimeout(12_000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal });
    return res.url || url;
  } finally {
    done();
  }
}

/** Abre no app dono do link (Spotify, YouTube, Mapas) ou, sem app, no navegador do sistema. */
export async function openExternal(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    /* sem app para o esquema */
  }
}

/** Navegador por cima do app, sem sair dele. */
export function openInApp(url: string) {
  return WebBrowser.openBrowserAsync(url, {
    toolbarColor: colors.night,
    controlsColor: colors.amber,
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  });
}
