import { enrichLink, isProbablyUrl, normalizeUrl } from "@myndshelf/core";
import { fetchHtml } from "./platform";
import { library } from "./store";
import { downscaleImage } from "./files";

/** Captura texto livre: vira link (com OpenGraph) ou nota. */
export async function captureText(input: string) {
  const text = input.trim();
  if (!text) return;
  const { addCapture, updateCapture } = library.getState();

  if (!isProbablyUrl(text)) {
    const firstLine = text.split("\n")[0].slice(0, 80);
    addCapture({ kind: "note", title: firstLine, note: text });
    return;
  }

  const url = normalizeUrl(text);
  const id = addCapture({ kind: "link", url, title: url, status: "loading" });
  try {
    const data = await enrichLink(url, fetchHtml);
    updateCapture(id, { ...data, status: "ready" });
  } catch {
    updateCapture(id, { status: "error" });
  }
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
    const data = await enrichLink(item.url, fetchHtml);
    library.getState().updateCapture(id, { ...data, status: "ready" });
  } catch {
    library.getState().updateCapture(id, { status: "error" });
  }
}
