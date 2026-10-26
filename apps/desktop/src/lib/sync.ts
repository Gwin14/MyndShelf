import { useStore } from "zustand";
import { configureAi } from "@myndshelf/core";
import { createSync, type FileAdapter, type SyncStatus } from "@myndshelf/sync";
import { isTauri, setServerHeaders } from "./platform";
import { isSample } from "./seed";
import { fileStore, idbStorage, library, onMissingFile } from "./store";

/** Originais da Estante: blobs no IndexedDB, um por criação. */
const files: FileAdapter = {
  has: async (c) => !!(await fileStore.local(c.id)),
  async upload(c, url, headers) {
    const blob = await fileStore.local(c.id);
    if (!blob) return;
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...headers, "content-type": c.mime || blob.type || "application/octet-stream", "x-file-name": encodeURIComponent(c.fileName ?? "") },
      body: blob,
    });
    if (!res.ok) throw new Error(`upload ${res.status}`);
  },
  async download(c, url, headers) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`download ${res.status}`);
    await fileStore.put(c.id, await res.blob());
  },
};

export const sync = createSync({ store: library, storage: idbStorage, files, isSample });

export function useSync<T>(selector: (s: SyncStatus) => T): T {
  return useStore(sync.status, selector);
}

/** No site (servido pelo próprio servidor) o endereço já é conhecido. */
export const suggestedServer = !isTauri && location.port !== "1420" ? location.origin : "";

export function startSync() {
  configureAi({ proxy: () => sync.aiProxy() });
  setServerHeaders(sync.authHeaders);
  onMissingFile(async (id) => {
    const c = library.getState().creations.find((x) => x.id === id);
    if (c && (await sync.ensureFile(c))) return fileStore.local(id);
  });

  void sync.start();
  // rede voltou, Tailscale conectou, janela voltou ao primeiro plano
  const now = () => void sync.now();
  window.addEventListener("online", now);
  window.addEventListener("focus", now);
}
