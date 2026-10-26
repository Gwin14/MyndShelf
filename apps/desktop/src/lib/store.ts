import { useStore } from "zustand";
import { createLibraryStore, type LibraryState } from "@myndshelf/core";
import { createStore as createIdb, del, get, set } from "idb-keyval";
import type { StateStorage } from "zustand/middleware";

export const kv = createIdb("myndshelf", "kv");
const files = createIdb("myndshelf-files", "blobs");

export const idbStorage: StateStorage = {
  getItem: async (key) => (await get<string>(key, kv)) ?? null,
  setItem: (key, value) => set(key, value, kv),
  removeItem: (key) => del(key, kv),
};

export const library = createLibraryStore(idbStorage);

export function useLibrary<T>(selector: (s: LibraryState) => T): T {
  return useStore(library, selector);
}

/** Quando o original não está aqui: a sincronização baixa do servidor (sob demanda). */
let missingFile: ((id: string) => Promise<Blob | undefined>) | undefined;
export const onMissingFile = (fn: typeof missingFile) => (missingFile = fn);

/** Arquivos originais da Estante ficam fora do estado, em um store de blobs. */
export const fileStore = {
  put: (id: string, blob: Blob) => set(id, blob, files),
  get: async (id: string) => (await get<Blob>(id, files)) ?? missingFile?.(id),
  /** só o que já está neste computador, sem ir ao servidor */
  local: (id: string) => get<Blob>(id, files),
  remove: (id: string) => del(id, files),
};

export const flags = {
  get: (key: string) => get<boolean>(`flag:${key}`, kv),
  set: (key: string) => set(`flag:${key}`, true, kv),
};
