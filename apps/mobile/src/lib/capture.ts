import * as ImagePicker from "expo-image-picker";
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
import { downscaleToDataUrl } from "./images";
import { entryAsItem, subscribe } from "./feeds";
import { useUi } from "./ui";
import { toast } from "./toast";
import type { FeedEntry } from "@myndshelf/types";

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
  // endereço de feed → vira assinatura, não captura
  if (looksLikeFeedUrl(url)) {
    try {
      const { id: feedId } = await subscribe(url);
      useUi.getState().set({ captureMode: "feeds", captureFeed: feedId });
      toast("Transmissão sintonizada ✦");
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

/** Foto da galeria ou da câmera vira uma prancha no mural. */
export async function captureImage(source: "library" | "camera") {
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.9, allowsMultipleSelection: source === "library", selectionLimit: 10 };
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return toast("Sem acesso à câmera.");
  }
  const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled) return;
  for (const asset of res.assets) {
    const image = await downscaleToDataUrl(asset.uri, asset.width, asset.height);
    const name = asset.fileName?.replace(/\.[^.]+$/, "");
    library.getState().addCapture({
      kind: "image",
      title: name || (source === "camera" ? "Fotografia" : "Imagem"),
      image,
      siteName: source === "camera" ? "câmera" : "galeria",
    });
  }
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

/** Guarda a entrada como captura (uma vez só), relendo a página para ganhar a capa certa. */
export async function saveEntry(entry: FeedEntry): Promise<string | undefined> {
  const s = library.getState();
  if (entry.savedAs && s.captures.some((c) => c.id === entry.savedAs)) return entry.savedAs;
  let id: string | undefined;
  if (entry.url) id = await captureText(entry.url);
  else {
    const { id: _id, ...item } = entryAsItem(entry, s.feeds.find((f) => f.id === entry.feedId));
    id = s.addCapture({ ...item, createdAt: Date.now() });
  }
  if (id) library.getState().updateEntry(entry.id, { savedAs: id, read: true });
  return id;
}
