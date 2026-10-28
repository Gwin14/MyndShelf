import {
  enrichLink,
  enrichPlace,
  formatCoords,
  isMapUrl,
  isProbablyUrl,
  looksLikeFeedUrl,
  normalizeUrl,
  parseCoordinates,
  placeFromCoordinates,
  placeTitle,
} from "@myndshelf/core";
import { fetchHtml, resolveUrl } from "./platform";
import { library } from "./store";
import { downscaleImage } from "./files";
import { subscribe } from "./feeds";
import { useUi } from "./ui";

/** Links de mapa viram lugares; o resto passa pelo OpenGraph. */
function enrich(url: string) {
  return isMapUrl(url) ? enrichPlace(url, fetchHtml, resolveUrl) : enrichLink(url, fetchHtml);
}

/** Coordenadas coladas como texto viram um lugar. */
async function captureCoordinates(lat: number, lng: number) {
  const { addCapture, updateCapture } = library.getState();
  const id = addCapture({
    kind: "place",
    title: formatCoords(lat, lng),
    place: { lat, lng, provider: "Coordenadas" },
    siteName: "Coordenadas",
    status: "loading",
  });
  const place = await placeFromCoordinates(lat, lng, fetchHtml);
  updateCapture(id, { place, title: placeTitle(place), description: place.address, status: "ready" });
  return id;
}

/** Captura texto livre: vira link (com OpenGraph), lugar ou nota. */
export async function captureText(input: string): Promise<string | undefined> {
  const text = input.trim();
  if (!text) return;
  const { addCapture, updateCapture } = library.getState();

  const coords = parseCoordinates(text);
  if (coords) return captureCoordinates(coords.lat, coords.lng);

  if (/^geo:/i.test(text)) {
    const id = addCapture({ kind: "place", url: text, title: "Lugar", status: "loading" });
    updateCapture(id, { ...(await enrich(text)), status: "ready" });
    return id;
  }

  if (!isProbablyUrl(text)) {
    const firstLine = text.split("\n")[0].slice(0, 80);
    return addCapture({ kind: "note", title: firstLine, note: text });
  }

  const url = normalizeUrl(text);
  // endereço de feed colado na barra → vira assinatura, não captura
  if (looksLikeFeedUrl(url)) {
    try {
      const { id: feedId } = await subscribe(url);
      useUi.getState().set({ captureFeed: feedId });
      return;
    } catch {
      /* não era feed afinal — segue como link comum */
    }
  }
  const id = addCapture({ kind: isMapUrl(url) ? "place" : "link", url, title: url, status: "loading" });
  try {
    const data = await enrich(url);
    updateCapture(id, { ...data, status: "ready" });
  } catch {
    updateCapture(id, { status: "error" });
  }
  return id;
}

export async function captureImageFile(file: File) {
  const image = await downscaleImage(file, 1400);
  library.getState().addCapture({
    kind: "image",
    title: file.name.replace(/\.[^.]+$/, ""),
    image,
    siteName: "arquivo local",
  });
}

export async function refreshCapture(id: string) {
  const item = library.getState().captures.find((c) => c.id === id);
  if (!item?.url) return;
  library.getState().updateCapture(id, { status: "loading" });
  try {
    const data = await enrich(item.url);
    library.getState().updateCapture(id, { ...data, status: "ready" });
  } catch {
    library.getState().updateCapture(id, { status: "error" });
  }
}

const healed = new Set<string>();

/**
 * Mídia de post expira (o CDN do Instagram assina as URLs por alguns dias): quando uma imagem
 * falha, relê o post em silêncio — uma vez por sessão — e troca só a mídia e o autor.
 */
export function healCapture(id: string) {
  const item = library.getState().captures.find((c) => c.id === id);
  if (!item?.url || healed.has(id)) return;
  healed.add(id);
  enrich(item.url)
    .then((data) => {
      if (data.social) library.getState().updateCapture(id, { image: data.image, social: data.social });
    })
    .catch(() => {});
}
