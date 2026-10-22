import { mediumFromFile, titleFromFileName } from "@myndshelf/core";
import { fileStore, library } from "./store";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Reduz uma imagem para uma prévia leve em data URL. */
export async function downscaleImage(file: Blob, max = 900): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Primeiro quadro (≈1s) de um vídeo como prévia. */
async function videoPoster(file: Blob, max = 900): Promise<string | undefined> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = url;
    await new Promise((res, rej) => {
      video.onloadeddata = res;
      video.onerror = rej;
    });
    video.currentTime = Math.min(1, video.duration / 3 || 0);
    await new Promise((res) => (video.onseeked = res));
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function addCreationsFromFiles(files: FileList | File[], shelfId: string | null = null) {
  for (const file of Array.from(files)) {
    const medium = mediumFromFile(file.name, file.type);
    let preview: string | undefined;
    try {
      if (medium === "image") preview = await downscaleImage(file);
      if (medium === "video") preview = await videoPoster(file);
    } catch {
      /* formato sem prévia no webview (ex.: PSD) */
    }
    const id = library.getState().addCreation({
      title: titleFromFileName(file.name),
      medium,
      fileName: file.name,
      mime: file.type,
      size: file.size,
      preview,
      year: new Date(file.lastModified || Date.now()).getFullYear(),
      shelfId,
    });
    await fileStore.put(id, file);
  }
}

export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}
