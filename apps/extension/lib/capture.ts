import {
  enrichLink,
  enrichPlace,
  formatCoords,
  hostOf,
  hueFrom,
  isMapUrl,
  isProbablyUrl,
  normalizeUrl,
  parseCoordinates,
  placeFromCoordinates,
  placeTitle,
  uid,
  type HtmlFetcher,
} from "@myndshelf/core";
import type { CaptureItem, PlaceInfo } from "@myndshelf/types";
import { fetchHtmlViaServer, resolveViaServer } from "./api";
import type { ServerSettings } from "./settings";

/** O que chega do popup, do menu de contexto ou do atalho. */
export type CaptureInput =
  | {
      type: "page";
      url: string;
      /** título da aba, caso a página não diga nada melhor */
      title?: string;
      note?: string;
      /** HTML da aba como o usuário vê: reserva quando o servidor não consegue ler a página */
      html?: string;
    }
  | { type: "text"; text: string; source?: string }
  | { type: "image"; src: string; pageUrl?: string; title?: string };

/** Mesmos padrões do `addCapture` do store. */
function item(input: Partial<CaptureItem> & { title: string }): CaptureItem {
  return {
    kind: "link",
    tags: [],
    status: "ready",
    createdAt: Date.now(),
    hue: hueFrom(input.url ?? input.title),
    ...input,
    id: uid(),
  };
}

const samePage = (a: string, b: string) => a.replace(/#.*$/, "") === b.replace(/#.*$/, "");

/** Monta a captura completa (OpenGraph, tipo, capa) antes de subir. */
export async function buildCapture(input: CaptureInput, s: ServerSettings | null): Promise<CaptureItem> {
  if (input.type === "image") return captureImage(input);
  if (input.type === "text") return captureText(input.text, input.source, s);

  const url = normalizeUrl(input.url);
  const fetchHtml: HtmlFetcher = async (u) => {
    try {
      if (!s) throw new Error("sem servidor");
      return await fetchHtmlViaServer(s, u);
    } catch (e) {
      if (input.html && samePage(u, url)) return input.html;
      throw e;
    }
  };
  const resolve = s ? (u: string) => resolveViaServer(s, u) : undefined;

  const data = isMapUrl(url) ? await enrichPlace(url, fetchHtml, resolve) : await enrichLink(url, fetchHtml);
  const fallback = input.title?.trim() || url;
  return item({ ...data, url, title: data.title && data.title !== url ? data.title : fallback, note: input.note?.trim() || undefined });
}

/** Texto selecionado: link, coordenadas ou nota — como o campo da Captura. */
async function captureText(raw: string, source: string | undefined, s: ServerSettings | null): Promise<CaptureItem> {
  const text = raw.trim();
  const coords = parseCoordinates(text);
  if (coords) {
    const fetchText: HtmlFetcher = (u) => (s ? fetchHtmlViaServer(s, u) : Promise.reject(new Error("sem servidor")));
    const place = await placeFromCoordinates(coords.lat, coords.lng, fetchText).catch((): PlaceInfo => ({ ...coords, provider: "Coordenadas" }));
    return item({ kind: "place", title: placeTitle(place) || formatCoords(coords.lat, coords.lng), description: place.address, place, siteName: "Coordenadas" });
  }
  if (isProbablyUrl(text) && !/\s/.test(text)) return buildCapture({ type: "page", url: text }, s);
  return item({
    kind: "note",
    title: text.split("\n")[0].slice(0, 80),
    note: source ? `${text}\n\n— ${source}` : text,
    siteName: source ? hostOf(source) : undefined,
  });
}

async function captureImage(input: { src: string; pageUrl?: string; title?: string }): Promise<CaptureItem> {
  const image = await downscale(input.src).catch(() => input.src);
  return item({
    kind: "image",
    title: input.title?.trim() || "Imagem",
    image,
    url: input.pageUrl,
    siteName: input.pageUrl ? hostOf(input.pageUrl) : "navegador",
  });
}

/**
 * Reduz a imagem para uma prévia leve em data URL (como o `downscaleImage` do desktop):
 * links de CDN expiram, a captura não deve depender deles.
 */
async function downscale(src: string, max = 1400, quality = 0.86): Promise<string> {
  if (src.startsWith("data:") && src.length < 600_000) return src;
  const blob = await (await fetch(src, { signal: AbortSignal.timeout(15_000) })).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const out = await canvas.convertToBlob({ type: "image/jpeg", quality });
  const bytes = new Uint8Array(await out.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(bin)}`;
}
