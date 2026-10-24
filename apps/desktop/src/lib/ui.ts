import { create } from "zustand";
import type { CaptureKind, CreationMedium } from "@myndshelf/types";

export type Section = "capture" | "shelf" | "projects";

interface UiState {
  section: Section;
  setSection(s: Section): void;

  captureKind: CaptureKind | "all";
  captureTag: string | null;
  captureQuery: string;
  /** null = mural; "all" = todas as transmissões; senão, id do feed */
  captureFeed: string | null;
  openCaptureId: string | null;
  viewerCaptureId: string | null;
  /** pergunta sobre o acervo inteiro, feita pela busca (n muda a cada envio) */
  libraryQuestion: { q: string; n: number } | null;

  shelfView: "shelf" | "gallery";
  shelfFilter: string; // "all" | "featured" | "loose" | shelfId
  shelfMedium: CreationMedium | "all";
  openCreationId: string | null;
  /** documento da Estante aberto no visualizador */
  readingCreationId: string | null;

  activeProjectId: string | null;

  /** algo está sendo arrastado do sistema para a janela (desktop) */
  nativeDrag: boolean;

  settingsOpen: boolean;

  set(patch: Partial<UiState>): void;
}

export const useUi = create<UiState>((set) => ({
  section: "capture",
  setSection: (section) => set({ section }),

  captureKind: "all",
  captureTag: null,
  captureQuery: "",
  captureFeed: null,
  openCaptureId: null,
  viewerCaptureId: null,
  libraryQuestion: null,

  shelfView: "shelf",
  shelfFilter: "all",
  shelfMedium: "all",
  openCreationId: null,
  readingCreationId: null,

  activeProjectId: null,

  nativeDrag: false,

  settingsOpen: false,

  set: (patch) => set(patch),
}));
