import type { ReactNode } from "react";
import { create } from "zustand";
import { press } from "./haptics";

export interface SheetEntry {
  label: string;
  icon?: ReactNode;
  hint?: string;
  danger?: boolean;
  onSelect?: () => void;
  /** submenu: abre outra lista dentro da mesma folha */
  children?: SheetEntry[];
}
export type MaybeEntry = SheetEntry | false | null | undefined | 0 | "";

interface SheetState {
  sheet: { title?: string; subtitle?: string; entries: SheetEntry[] } | null;
  open(entries: MaybeEntry[], title?: string, subtitle?: string): void;
  close(): void;
}

export const clean = (entries: MaybeEntry[]) => entries.filter(Boolean) as SheetEntry[];

/** Folha de ações — o menu de contexto do desktop, aberto por toque longo. */
export const useSheet = create<SheetState>((set) => ({
  sheet: null,
  open(entries, title, subtitle) {
    press();
    set({ sheet: { entries: clean(entries), title, subtitle } });
  },
  close: () => set({ sheet: null }),
}));

export const openSheet = (entries: MaybeEntry[], title?: string, subtitle?: string) => useSheet.getState().open(entries, title, subtitle);
