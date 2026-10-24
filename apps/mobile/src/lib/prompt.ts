import { create } from "zustand";

interface PromptState {
  prompt: { title: string; placeholder?: string; initial?: string; action?: string; resolve(v: string | null): void } | null;
}

export const usePrompt = create<PromptState>(() => ({ prompt: null }));

/** Pede um texto curto (nome de estante, de projeto…) — o Alert.prompt que funciona nos dois sistemas. */
export function askText(title: string, opts: { placeholder?: string; initial?: string; action?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => usePrompt.setState({ prompt: { title, ...opts, resolve } }));
}
