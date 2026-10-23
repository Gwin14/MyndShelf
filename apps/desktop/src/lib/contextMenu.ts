import type { MouseEvent, ReactNode } from "react";
import { create } from "zustand";

export type MenuEntry =
  | {
      label: string;
      icon?: ReactNode;
      /** atalho ou detalhe à direita (ex.: "⌘1", "3 itens") */
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      /** marca o item como o estado atual (ex.: tipo selecionado) */
      checked?: boolean;
      onSelect?: () => void;
      children?: MenuEntry[];
    }
  | { separator: true }
  | { heading: string };

export const sep: MenuEntry = { separator: true };

/** Entradas condicionais: `cond && {...}` pode virar false/""/undefined, e são descartadas. */
export type MaybeEntry = MenuEntry | false | null | undefined | "";

interface MenuState {
  menu: { x: number; y: number; entries: MenuEntry[] } | null;
  open(x: number, y: number, entries: MenuEntry[]): void;
  close(): void;
}

export const useContextMenu = create<MenuState>((set) => ({
  menu: null,
  open: (x, y, entries) => set({ menu: { x, y, entries } }),
  close: () => set({ menu: null }),
}));

/** Remove separadores repetidos, nas pontas e itens vazios (`false`/`undefined` de condições). */
export function clean(entries: MaybeEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const e of entries) {
    if (!e) continue;
    if ("separator" in e && (!out.length || "separator" in out[out.length - 1])) continue;
    out.push(e);
  }
  while (out.length && "separator" in out[out.length - 1]) out.pop();
  return out;
}

/**
 * Handler de clique direito para um elemento: `onContextMenu={menu(() => [...])}`.
 * As entradas são montadas na hora do clique, com o estado mais recente.
 */
export function menu(build: () => MaybeEntry[]) {
  return (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const entries = clean(build());
    if (entries.length) useContextMenu.getState().open(e.clientX, e.clientY, entries);
  };
}

export function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}
