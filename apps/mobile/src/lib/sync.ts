import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useStore } from "zustand";
import { Directory, File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import { configureAi } from "@myndshelf/core";
import { createSync, type FileAdapter, type SyncStatus } from "@myndshelf/sync";
import type { Creation } from "@myndshelf/types";
import type { StateStorage } from "zustand/middleware";
import { creationFile, root, safeName } from "./files";
import { isSample } from "./seed";
import { library, ready, storage } from "./store";

/** O token fica no cofre do sistema, como a chave do Gemini. */
const secrets: StateStorage = {
  getItem: (k) => SecureStore.getItemAsync(k).catch(() => null),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
};

/** Originais da Estante: um arquivo por criação em Documents/creations/<id>/. */
const files: FileAdapter = {
  has: async (c) => !!creationFile(c),
  async upload(c, url, headers) {
    const file = creationFile(c);
    if (!file) return;
    const res = await expoFetch(url, {
      method: "PUT",
      headers: { ...headers, "content-type": c.mime || "application/octet-stream", "x-file-name": encodeURIComponent(c.fileName ?? file.name) },
      body: await file.bytes(),
    });
    if (!res.ok) throw new Error(`upload ${res.status}`);
  },
  async download(c, url, headers) {
    const dir = new Directory(root(), c.id);
    if (!dir.exists) dir.create({ intermediates: true });
    const dest = new File(dir, safeName(c.fileName ?? c.title));
    if (dest.exists) dest.delete();
    const file = await File.downloadFileAsync(url, dest, { headers, idempotent: true });
    return { filePath: file.uri };
  },
};

// o fetch padrão do React Native não manda bytes no corpo; o do Expo manda
export const sync = createSync({ store: library, storage, secrets, files, isSample, fetch: expoFetch as unknown as typeof fetch });

export function useSync<T>(selector: (s: SyncStatus) => T): T {
  return useStore(sync.status, selector);
}

/** Arquivo da criação, baixando do servidor quando não está no aparelho. */
export async function ensureCreationFile(c: Creation): Promise<File | undefined> {
  const here = creationFile(c);
  if (here) return here;
  if (!(await sync.ensureFile(c))) return;
  const fresh = library.getState().creations.find((x) => x.id === c.id);
  return fresh && creationFile(fresh);
}

/** Para telas: baixa sob demanda e avisa enquanto desce. */
export function useCreationFile(c: Creation | undefined): { file: File | undefined; loading: boolean } {
  const file = c ? creationFile(c) : undefined;
  const connected = useSync((s) => !!s.url);
  const [loading, setLoading] = useState(false);
  const missing = !!c && !file && connected && c.medium !== "folder";
  useEffect(() => {
    if (!missing || !c) return;
    let alive = true;
    setLoading(true);
    void sync.ensureFile(c).finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [missing, c?.id]);
  return { file, loading: missing && loading };
}

export function startSync() {
  configureAi({ proxy: () => sync.aiProxy() });
  void ready().then(() => sync.start());
  // voltou ao app (Tailscale pode ter conectado nesse meio-tempo)
  const sub = AppState.addEventListener("change", (s) => s === "active" && void sync.now());
  return () => {
    sub.remove();
    sync.stop();
  };
}
