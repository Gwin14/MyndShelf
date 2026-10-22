import { useStore } from "zustand";
import { createLibraryStore, type LibraryState } from "@myndshelf/core";
import { createStore as createIdb, del, get, set } from "idb-keyval";
import type { StateStorage } from "zustand/middleware";

const kv = createIdb("myndshelf", "kv");
const files = createIdb("myndshelf-files", "blobs");

const idbStorage: StateStorage = {
  getItem: async (key) => (await get<string>(key, kv)) ?? null,
  setItem: (key, value) => set(key, value, kv),
  removeItem: (key) => del(key, kv),
};

export const library = createLibraryStore(idbStorage);

export function useLibrary<T>(selector: (s: LibraryState) => T): T {
  return useStore(library, selector);
}

/** Arquivos originais da Estante ficam fora do estado, em um store de blobs. */
export const fileStore = {
  put: (id: string, blob: Blob) => set(id, blob, files),
  get: (id: string) => get<Blob>(id, files),
  remove: (id: string) => del(id, files),
};

export const flags = {
  get: (key: string) => get<boolean>(`flag:${key}`, kv),
  set: (key: string) => set(`flag:${key}`, true, kv),
};
