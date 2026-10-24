import { create } from "zustand";
import type { CaptureKind, CreationMedium } from "@myndshelf/types";

interface UiState {
  captureKind: CaptureKind | "all";
  captureTag: string | null;
  captureQuery: string;
  /** mural ou transmissões */
  captureMode: "wall" | "feeds";
  /** null = todas as transmissões; senão, id do feed */
  captureFeed: string | null;

  shelfView: "shelf" | "gallery";
  shelfFilter: string; // "all" | "featured" | "loose" | shelfId
  shelfMedium: CreationMedium | "all";

  set(patch: Partial<UiState>): void;
}

export const useUi = create<UiState>((set) => ({
  captureKind: "all",
  captureTag: null,
  captureQuery: "",
  captureMode: "wall",
  captureFeed: null,

  shelfView: "shelf",
  shelfFilter: "all",
  shelfMedium: "all",

  set: (patch) => set(patch),
}));
