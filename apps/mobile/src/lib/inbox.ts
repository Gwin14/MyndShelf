import { AppState, Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { captureText } from "./capture";
import { success } from "./haptics";
import { downscaleToDataUrl } from "./images";
import { library, ready } from "./store";
import { toast } from "./toast";

/** O mesmo App Group de targets/share (Inbox.swift). */
const GROUP = "group.com.myndshelf.app";

interface SharedItem {
  id: string;
  kind: "url" | "text" | "image";
  url?: string;
  text?: string;
  image?: string;
  title?: string;
  note?: string;
  createdAt: number;
}

function inboxDir(): Directory | undefined {
  if (Platform.OS !== "ios") return;
  // só existe no app de verdade (dev build/loja); no Expo Go não há App Group
  const root = Paths.appleSharedContainers?.[GROUP];
  if (!root) return;
  const dir = new Directory(root, "inbox");
  return dir.exists ? dir : undefined;
}

let running = false;

/** Guarda na Captura o que chegou pela extensão de compartilhar e limpa a caixa. */
export async function importInbox() {
  const dir = inboxDir();
  if (!dir || running) return;
  running = true;
  try {
    await ready();
    const files = dir.list().filter((f): f is File => f instanceof File && f.name.endsWith(".json"));
    const items: { item: SharedItem; file: File }[] = [];
    for (const file of files) {
      try {
        items.push({ item: JSON.parse(await file.text()) as SharedItem, file });
      } catch {
        file.delete(); // JSON quebrado não volta a ser lido
      }
    }
    items.sort((a, b) => a.item.createdAt - b.item.createdAt);

    let count = 0;
    for (const { item, file } of items) {
      // apaga antes de guardar: se o app fechar no meio, nada entra duas vezes
      file.delete();
      const id = await save(item, dir);
      if (id) {
        count++;
        if (item.note) library.getState().updateCapture(id, { note: item.note });
      }
    }
    if (count) {
      success();
      toast(count === 1 ? "Chegou um item pelo compartilhar ✦" : `Chegaram ${count} itens pelo compartilhar ✦`);
    }
  } finally {
    running = false;
  }
}

async function save(item: SharedItem, dir: Directory): Promise<string | undefined> {
  if (item.kind === "image" && item.image) {
    const file = new File(dir, item.image);
    if (!file.exists) return;
    try {
      const image = await downscaleToDataUrl(file.uri, 0, 0, 1400);
      return library.getState().addCapture({ kind: "image", title: "Imagem compartilhada", image, siteName: "compartilhar", createdAt: item.createdAt });
    } finally {
      file.delete();
    }
  }
  const input = item.kind === "url" ? item.url : item.text;
  if (!input) return;
  return captureText(input);
}

/** Importa ao abrir e sempre que o app volta para a frente. */
export function startInbox() {
  void importInbox();
  const sub = AppState.addEventListener("change", (s) => s === "active" && void importInbox());
  return () => sub.remove();
}
