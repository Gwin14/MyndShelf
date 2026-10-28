import { Directory, File, Paths } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { docKindOf, isCodeFile, mediumFromFile, titleFromFileName } from "@myndshelf/core";
import type { Creation } from "@myndshelf/types";
import { downscaleToDataUrl } from "./images";
import { library } from "./store";
import { exclusive } from "./pickers";
import { toast } from "./toast";

/** Arquivos originais da Estante ficam na pasta do app, um por criação. */
export const root = () => {
  const dir = new Directory(Paths.document, "creations");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
};

export const safeName = (name: string) => name.replace(/[^\w.\-() ]+/g, "_").slice(-120) || "arquivo";

async function keepFile(id: string, uri: string, name: string): Promise<File> {
  const dir = new Directory(root(), id);
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new File(dir, safeName(name));
  if (dest.exists) dest.delete();
  await new File(uri).copy(dest);
  return dest;
}

/**
 * Arquivo da criação neste aparelho. O caminho guardado é absoluto, e o iOS troca a pasta do app
 * a cada reinstalação (o UUID muda); então, se ele sumiu, procuramos em creations/<id>/.
 */
export function creationFile(c: Pick<Creation, "id" | "filePath" | "fileName" | "title">): File | undefined {
  if (c.filePath) {
    const f = new File(c.filePath);
    if (f.exists) return f;
  }
  const dir = new Directory(root(), c.id);
  if (!dir.exists) return;
  const named = new File(dir, safeName(c.fileName ?? c.title));
  if (named.exists) return named;
  return dir.list().find((e): e is File => e instanceof File && !e.name.startsWith("."));
}

/** O app sabe mostrar por dentro (o arquivo pode ainda estar no servidor). */
export function canOpenCreation(c: Pick<Creation, "fileName" | "mime" | "medium">): boolean {
  return !!docKindOf(c) || /^(image|audio|video)$/.test(c.medium);
}

export function removeCreationFiles(id: string) {
  const dir = new Directory(root(), id);
  if (dir.exists) dir.delete();
}

export { docKindOf, type DocKind } from "@myndshelf/core";

export async function addCreationFromAsset(asset: { uri: string; name: string; mimeType?: string | null; size?: number | null; width?: number; height?: number }, shelfId: string | null = null) {
  const medium = mediumFromFile(asset.name, asset.mimeType ?? "");
  const s = library.getState();
  const id = s.addCreation({
    title: titleFromFileName(asset.name),
    medium: isCodeFile(asset.name) ? "code" : medium,
    fileName: asset.name,
    mime: asset.mimeType ?? undefined,
    size: asset.size ?? undefined,
    year: new Date().getFullYear(),
    shelfId,
  });
  try {
    const file = await keepFile(id, asset.uri, asset.name);
    let preview: string | undefined;
    if (medium === "image") preview = await downscaleToDataUrl(asset.uri, asset.width ?? 0, asset.height ?? 0, 900, 0.82).catch(() => undefined);
    s.updateCreation(id, { filePath: file.uri, size: asset.size ?? file.size, preview });
  } catch {
    toast("Não deu para guardar o arquivo.");
  }
  return id;
}

/** Arquivos de qualquer tipo (Arquivos/iCloud/Drive). */
export async function pickFiles(shelfId: string | null = null) {
  const res = await exclusive(() => DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true }));
  if (!res || res.canceled) return [];
  const ids: string[] = [];
  for (const a of res.assets) ids.push(await addCreationFromAsset({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size }, shelfId));
  return ids;
}

/** Fotos e vídeos da galeria. */
export async function pickMedia(shelfId: string | null = null) {
  const res = await exclusive(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true, quality: 1 }));
  if (!res || res.canceled) return [];
  const ids: string[] = [];
  for (const a of res.assets) {
    const ext = a.type === "video" ? "mp4" : "jpg";
    const name = a.fileName ?? `${a.type === "video" ? "video" : "imagem"}-${Date.now()}.${ext}`;
    ids.push(await addCreationFromAsset({ uri: a.uri, name, mimeType: a.mimeType, size: a.fileSize, width: a.width, height: a.height }, shelfId));
  }
  return ids;
}

/** Texto escrito no próprio app vira um manuscrito com arquivo .md. */
export async function addManuscript(title: string, body: string, shelfId: string | null = null) {
  const s = library.getState();
  const name = `${safeName(title || "manuscrito")}.md`;
  const id = s.addCreation({ title: title || "Manuscrito", medium: "text", fileName: name, mime: "text/markdown", year: new Date().getFullYear(), shelfId });
  const dir = new Directory(root(), id);
  dir.create({ intermediates: true });
  const file = new File(dir, name);
  file.create({ overwrite: true });
  await file.write(body);
  s.updateCreation(id, { filePath: file.uri, size: file.size });
  return id;
}

export async function shareCreation(c: Creation) {
  const file = creationFile(c);
  if (!file) return toast("O arquivo original não está neste aparelho.");
  if (!(await Sharing.isAvailableAsync())) return toast("Compartilhar não está disponível aqui.");
  await Sharing.shareAsync(file.uri, { mimeType: c.mime, dialogTitle: c.title });
}
