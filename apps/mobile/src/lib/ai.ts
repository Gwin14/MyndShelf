import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import {
  AiError,
  CATEGORIZE_SCHEMA,
  cleanTags,
  describeCapture,
  describeCreation,
  generateJson,
  libraryCatalog,
  PROMPTS,
  streamText,
  viewModeOf,
  type AiPart,
  type Categorization,
  type LibraryRef,
} from "@myndshelf/core";
import type { CaptureItem, Creation } from "@myndshelf/types";
import { creationFile, docKindOf } from "./files";
import { loadArticle } from "./reader";
import { library, prefs } from "./store";

/* ───────────────────────── ajustes ───────────────────────── */

const ENV_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "";
const KEY_ITEM = "gemini-key";

interface AiSettings {
  key: string;
  /** etiquetar e ajustar o tipo das capturas novas */
  autoTag: boolean;
  setKey(key: string): void;
  setAutoTag(on: boolean): void;
}

export const useAi = create<AiSettings>((setState) => ({
  key: ENV_KEY,
  autoTag: true,
  setKey(key) {
    setState({ key: key.trim() || ENV_KEY });
    void (key.trim() ? SecureStore.setItemAsync(KEY_ITEM, key.trim()) : SecureStore.deleteItemAsync(KEY_ITEM));
  },
  setAutoTag(autoTag) {
    setState({ autoTag });
    void prefs.set("auto-tag", autoTag ? "1" : "0");
  },
}));

void Promise.all([SecureStore.getItemAsync(KEY_ITEM).catch(() => null), prefs.get("auto-tag")]).then(([key, autoTag]) =>
  useAi.setState({ key: key || ENV_KEY, autoTag: autoTag !== "0" }),
);

function key(): string {
  const k = useAi.getState().key;
  if (!k) throw new AiError("no-key");
  return k;
}

/* ───────────────────────── brilho: o que a IA está fazendo ou acabou de fazer ───────────────────────── */

const GLOW_MS = 4000;

interface GlowState {
  /** itens sendo lidos agora (o card respira) */
  working: Record<string, true>;
  /** marcas recentes: `${id}:tag:${t}`, `${id}:card` */
  fresh: Record<string, true>;
}

export const useGlow = create<GlowState>(() => ({ working: {}, fresh: {} }));

function setWorking(id: string, on: boolean) {
  useGlow.setState((s) => {
    const working = { ...s.working };
    if (on) working[id] = true;
    else delete working[id];
    return { working };
  });
}

function markFresh(keys: string[]) {
  if (!keys.length) return;
  useGlow.setState((s) => ({ fresh: { ...s.fresh, ...Object.fromEntries(keys.map((k) => [k, true])) } }));
  setTimeout(
    () =>
      useGlow.setState((s) => {
        const fresh = { ...s.fresh };
        for (const k of keys) delete fresh[k];
        return { fresh };
      }),
    GLOW_MS,
  );
}

/* ───────────────────────── conteúdo dos itens ───────────────────────── */

/** Menos texto, resposta mais rápida: o começo de um texto longo já diz do que ele trata. */
const TEXT_LIMIT = 60_000;
const INLINE_LIMIT = 18 * 1024 * 1024;

function dataUrlPart(url: string | undefined): AiPart | undefined {
  const m = url && /^data:([^;,]+);base64,(.+)$/.exec(url);
  return m ? { inlineData: { mimeType: m[1], data: m[2] } } : undefined;
}

/** Texto de que a captura trata: o artigo inteiro ou a nota. */
async function captureText(item: CaptureItem): Promise<string | undefined> {
  if (viewModeOf(item) === "read" && item.url) {
    const article = await loadArticle(item.url);
    if (article) return article.text.slice(0, TEXT_LIMIT);
  }
  if (item.kind === "note" && (item.note?.length ?? 0) > 400) return item.note!.slice(0, TEXT_LIMIT);
}

async function captureParts(item: CaptureItem): Promise<AiPart[]> {
  const parts: AiPart[] = [{ text: describeCapture(item) }];
  const text = item.kind === "note" ? undefined : await captureText(item);
  if (text) parts.push({ text: `Texto do artigo:\n${text}` });
  const image = dataUrlPart(item.image);
  if (image) parts.push(image);
  return parts;
}

/** Criações de texto vão como texto; PDF, imagem e áudio vão como arquivo — o Gemini lê PDF sozinho. */
async function creationParts(c: Creation): Promise<AiPart[]> {
  const parts: AiPart[] = [{ text: describeCreation(c) }];
  const file = creationFile(c);
  const kind = docKindOf(c);
  if (!file) {
    const preview = dataUrlPart(c.preview);
    if (preview) parts.push(preview);
    return parts;
  }
  if (kind && kind !== "pdf") {
    parts.push({ text: `Conteúdo do arquivo:\n${(await file.text()).slice(0, TEXT_LIMIT)}` });
  } else if (file.size <= INLINE_LIMIT && (kind === "pdf" || /^(image|audio)$/.test(c.medium))) {
    const mimeType = kind === "pdf" ? "application/pdf" : c.mime || (c.medium === "image" ? "image/jpeg" : "audio/mpeg");
    parts.push({ inlineData: { mimeType, data: await file.base64() } });
  }
  return parts;
}

/** Itens com texto de verdade para resumir. */
export function canSummarizeCapture(item: CaptureItem): boolean {
  if (item.status !== "ready") return false;
  return viewModeOf(item) === "read" || (item.kind === "note" && (item.note?.length ?? 0) > 400);
}

/** Criações que o Gemini consegue ler por dentro. */
export function canReadCreation(c: Creation): boolean {
  return !!docKindOf(c) || c.medium === "image" || c.medium === "audio";
}

/** Abriu o detalhe: já vai buscando o texto, para o resumo começar sem espera. */
export function warmCapture(item: CaptureItem) {
  if (viewModeOf(item) === "read" && item.url) void loadArticle(item.url);
}

/* ───────────────────────── ações ───────────────────────── */

type OnText = (text: string) => void;

export async function summarizeCapture(item: CaptureItem, onText: OnText, signal?: AbortSignal) {
  // o resumo vive só enquanto o item está aberto: nada é guardado
  return streamText({ key: key(), system: PROMPTS.summary, parts: await captureParts(item), signal, temperature: 0.2 }, onText);
}

export async function summarizeCreation(c: Creation, onText: OnText, signal?: AbortSignal) {
  return streamText({ key: key(), system: PROMPTS.summary, parts: await creationParts(c), signal, temperature: 0.2 }, onText);
}

export async function analyzeCreation(c: Creation, onText: OnText, signal?: AbortSignal) {
  const text = await streamText({ key: key(), system: PROMPTS.analysis, parts: await creationParts(c), signal, temperature: 0.2 }, onText);
  library.getState().updateCreation(c.id, { analysis: text });
  return text;
}

/** Pergunta sobre o acervo inteiro; as referências curtas ([[c3]]) chegam antes do texto. */
export async function askLibrary(q: string, onRefs: (refs: Map<string, LibraryRef>) => void, onText: OnText, signal?: AbortSignal) {
  const { text, refs } = libraryCatalog(library.getState());
  onRefs(refs);
  return streamText({ key: key(), system: PROMPTS.library, parts: [{ text }, { text: `Pergunta: ${q}` }], signal, temperature: 0.2 }, onText);
}

/* ───────────────────────── etiquetar ao guardar ───────────────────────── */

/** Um pedido só: etiquetas e, para links genéricos, o tipo certo. */
async function categorize(id: string) {
  const item = library.getState().captures.find((c) => c.id === id);
  if (!item) return;
  setWorking(id, true);
  try {
    const counts = new Map<string, number>();
    for (const c of library.getState().captures) for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    const existing = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80).map(([t]) => t);

    const parts: AiPart[] = [{ text: `Etiquetas já usadas no acervo: ${existing.join(", ") || "nenhuma"}\n\nItem novo:\n${describeCapture(item)}` }];
    const image = dataUrlPart(item.image);
    if (image) parts.push(image);

    const result = await generateJson<Categorization>({ key: key(), system: PROMPTS.categorize, parts, temperature: 0.1 }, CATEGORIZE_SCHEMA);
    // a pessoa pode ter mexido no item enquanto a resposta vinha
    const now = library.getState().captures.find((c) => c.id === id);
    if (!now) return;
    const tags = cleanTags(result.tags ?? [], now.tags);
    // a detecção por regras é melhor quando acerta — só corrige o "link" genérico
    const kind = now.kind === "link" && result.kind && result.kind !== "link" ? result.kind : undefined;
    library.getState().updateCapture(id, { tags: [...now.tags, ...tags], ...(kind && { kind }) });
    markFresh([...tags.map((t) => `${id}:tag:${t}`), ...(tags.length || kind ? [`${id}:card`] : [])]);
  } finally {
    setWorking(id, false);
  }
}

/** Botão "sugerir" das etiquetas: o mesmo pedido, sob demanda. */
export const suggestTags = (id: string) => categorize(id);

/** Observa o acervo e categoriza cada captura nova quando ela fica pronta, venha de onde vier. */
export function startAutoTag() {
  const startedAt = Date.now();
  const done = new Set<string>();
  let queue = Promise.resolve();

  const check = () => {
    const { key: k, autoTag } = useAi.getState();
    if (!k || !autoTag) return;
    for (const c of library.getState().captures) {
      if (c.createdAt < startedAt || c.status !== "ready" || done.has(c.id)) continue;
      done.add(c.id);
      queue = queue.then(() => categorize(c.id).catch(() => {}));
    }
  };
  return library.subscribe(check);
}

/* ───────────────────────── estado de uma execução na interface ───────────────────────── */

export type RunState =
  | { status: "idle" }
  | { status: "thinking" }
  | { status: "streaming" | "done"; text: string }
  | { status: "needs-key" }
  | { status: "error"; message: string };

/** Roda uma ação que escreve aos poucos. Se faltar a chave, guarda a ação para repetir depois. */
export function useAiRun() {
  const [state, setState] = useState<RunState>({ status: "idle" });
  const abort = useRef<AbortController>(null);
  const pending = useRef<((onText: OnText, signal: AbortSignal) => Promise<unknown>) | null>(null);

  const run = useCallback(async (fn: (onText: OnText, signal: AbortSignal) => Promise<unknown>) => {
    abort.current?.abort();
    const ctrl = (abort.current = new AbortController());
    pending.current = fn;
    setState({ status: "thinking" });
    let last = "";
    try {
      await fn((text) => {
        last = text;
        if (!ctrl.signal.aborted) setState({ status: "streaming", text });
      }, ctrl.signal);
      if (!ctrl.signal.aborted) setState({ status: "done", text: last });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      if (e instanceof AiError && (e.code === "no-key" || e.code === "bad-key")) {
        setState(e.code === "no-key" ? { status: "needs-key" } : { status: "error", message: e.message });
      } else setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const retry = useCallback(() => pending.current && void run(pending.current), [run]);
  const reset = useCallback(() => {
    abort.current?.abort();
    setState({ status: "idle" });
  }, []);

  useEffect(() => () => abort.current?.abort(), []);

  return { state, run, retry, reset };
}

export type { LibraryRef };
