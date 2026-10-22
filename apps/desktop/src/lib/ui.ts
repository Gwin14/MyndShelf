import { create } from "zustand";
import type { CaptureKind, CreationMedium } from "@myndshelf/types";

export type Section = "capture" | "shelf" | "projects";

interface UiState {
  section: Section;
  setSection(s: Section): void;

  captureKind: CaptureKind | "all";
  captureTag: string | null;
  captureQuery: string;
  openCaptureId: string | null;
  viewerCaptureId: string | null;

  shelfView: "shelf" | "gallery";
  shelfFilter: string; // "all" | "featured" | "loose" | shelfId
  shelfMedium: CreationMedium | "all";
  openCreationId: string | null;

  activeProjectId: string | null;

  set(patch: Partial<UiState>): void;
}

export const useUi = create<UiState>((set) => ({
  section: "capture",
  setSection: (section) => set({ section }),

  captureKind: "all",
  captureTag: null,
  captureQuery: "",
  openCaptureId: null,
  viewerCaptureId: null,

  shelfView: "shelf",
  shelfFilter: "all",
  shelfMedium: "all",
  openCreationId: null,

  activeProjectId: null,

  set: (patch) => set(patch),
}));
