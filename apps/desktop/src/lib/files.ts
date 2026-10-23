import { mediumFromFile, titleFromFileName } from "@myndshelf/core";
import { pdfCover } from "./documents";
import { pathInfo, readDroppedFile, type PathInfo } from "./platform";
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

export async function addCreationsFromFiles(
  files: FileList | File[],
  shelfId: string | null = null,
  /** caminho original no disco, quando veio do arrastar nativo */
  paths: (string | undefined)[] = [],
) {
  for (const [i, file] of Array.from(files).entries()) {
    const medium = mediumFromFile(file.name, file.type);
    let preview: string | undefined;
    try {
      if (medium === "image") preview = await downscaleImage(file);
      if (medium === "video") preview = await videoPoster(file);
      if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") preview = await pdfCover(file);
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
      filePath: paths[i],
    });
    await fileStore.put(id, file);
  }
}

/** Uma pasta vira objeto da Estante: guardamos o caminho e uma amostra do conteúdo. */
export function addFolderCreation(info: Pick<PathInfo, "name" | "items" | "sample" | "modified">, path: string | undefined, shelfId: string | null) {
  return library.getState().addCreation({
    title: info.name.charAt(0).toUpperCase() + info.name.slice(1),
    medium: "folder",
    fileName: info.name,
    filePath: path,
    folder: { items: info.items ?? 0, sample: info.sample },
    year: new Date(info.modified ?? Date.now()).getFullYear(),
    shelfId,
  });
}

/** Itens arrastados do sistema (desktop): pastas viram pastas, arquivos são lidos do disco. */
export async function addDroppedPaths(paths: string[], shelfId: string | null) {
  for (const path of paths) {
    try {
      const info = await pathInfo(path);
      if (info.isDir) addFolderCreation(info, path, shelfId);
      else await addCreationsFromFiles([await readDroppedFile(path, info.name)], shelfId, [path]);
    } catch (e) {
      console.warn("não deu para adicionar", path, e);
    }
  }
}

/** No navegador não há caminho real: a pasta vira objeto só com nome e conteúdo. */
export async function addFolderFromEntry(entry: FileSystemDirectoryEntry, shelfId: string | null) {
  const children = await new Promise<FileSystemEntry[]>((resolve) => entry.createReader().readEntries(resolve, () => resolve([])));
  const visible = children.filter((c) => !c.name.startsWith("."));
  visible.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
  addFolderCreation(
    { name: entry.name, items: visible.length, sample: visible.slice(0, 8).map((c) => (c.isDirectory ? `${c.name}/` : c.name)) },
    undefined,
    shelfId,
  );
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
