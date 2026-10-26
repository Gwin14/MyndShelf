import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createLibraryStore, type LibraryState } from "@myndshelf/core";
import type { StateStorage } from "zustand/middleware";
import { useStore } from "zustand";

export const storage: StateStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

export const library = createLibraryStore(storage);

// o acervo grava com atraso; indo para o fundo, grava já (o iOS pode encerrar o app)
AppState.addEventListener("change", (s) => s !== "active" && void library.flush());

export function useLibrary<T>(selector: (s: LibraryState) => T): T {
  return useStore(library, selector);
}

export const flags = {
  get: async (key: string) => (await AsyncStorage.getItem(`flag:${key}`)) === "1",
  set: (key: string) => AsyncStorage.setItem(`flag:${key}`, "1"),
};

export const prefs = {
  get: (key: string) => AsyncStorage.getItem(`setting:${key}`),
  set: (key: string, value: string) => AsyncStorage.setItem(`setting:${key}`, value),
};

/** Promessa única de hidratação — telas e serviços esperam por ela. */
let hydrated: Promise<void> | undefined;
export function ready(): Promise<void> {
  hydrated ??= Promise.resolve(library.persist.rehydrate());
  return hydrated;
}
