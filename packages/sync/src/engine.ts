import { createStore } from "zustand/vanilla";
import type { StateStorage } from "zustand/middleware";
import type { Creation, LibraryData } from "@myndshelf/types";
import { uid, type LibraryStore } from "@myndshelf/core";
import { API, COLLECTIONS, LOCAL_ONLY, type Change, type ChangesResponse, type Collection, type PushResponse, type ServerInfo } from "./protocol";

/* ───────────────────────── tipos ───────────────────────── */

export interface SyncConfig {
  url: string;
  token: string;
}

/**
 * Como cada plataforma guarda os arquivos originais da Estante.
 * Desktop: blobs no IndexedDB. Mobile: pasta do app (`filePath`).
 */
export interface FileAdapter {
  /** o arquivo original está neste aparelho? */
  has(c: Creation): Promise<boolean>;
  upload(c: Creation, url: string, headers: Record<string, string>): Promise<void>;
  /** baixa e guarda; devolve o que mudar na criação (ex.: o novo `filePath`) */
  download(c: Creation, url: string, headers: Record<string, string>): Promise<Partial<Creation> | void>;
}

export type SyncPhase = "off" | "idle" | "syncing" | "offline" | "error";

export interface SyncStatus {
  /** endereço do servidor; null quando o app está só no modo local */
  url: string | null;
  phase: SyncPhase;
  error?: string;
  lastSync?: number;
  /** mudanças na fila de envio */
  pending: number;
  /** arquivos esperando subir */
  pendingFiles: number;
  /** manter todos os arquivos da Estante baixados */
  keepFiles: boolean;
  /** o servidor tem chave do Gemini */
  ai: boolean;
}

export interface SyncOptions {
  store: LibraryStore;
  /** onde fica o estado da sincronização (fila, cursor) — o mesmo storage do acervo serve */
  storage: StateStorage;
  /** onde fica o token; padrão: `storage` */
  secrets?: StateStorage;
  files?: FileAdapter;
  /** o React Native precisa do `expo/fetch` para mandar bytes */
  fetch?: typeof fetch;
  /** de quanto em quanto tempo sincroniza sozinho (ms) */
  interval?: number;
  /** itens de exemplo da primeira abertura: não sobem ao ligar um aparelho novo */
  isSample?: (collection: Collection, rec: { id: string } & Record<string, unknown>) => boolean;
}

interface Pending {
  ts: number;
  del?: true;
}

interface Persisted {
  device: string;
  url: string | null;
  cursor: number;
  /** `${collection}/${id}` → última mudança local ainda não enviada */
  outbox: Record<string, Pending>;
  /** ids de criações cujo arquivo ainda precisa subir */
  files: string[];
  keepFiles: boolean;
  lastSync?: number;
  ai?: boolean;
}

type Rec = { id: string; createdAt?: number; updatedAt?: number; publishedAt?: number; status?: string } & Record<string, unknown>;

export class SyncHttpError extends Error {
  constructor(
    public status: number,
    detail: string,
  ) {
    super(detail || `O servidor respondeu com erro ${status}.`);
  }
}

const STATE_KEY = "myndshelf-sync";
const TOKEN_KEY = "myndshelf-sync-token";
const BATCH = 100;
const BATCH_BYTES = 3_000_000;
/** arquivo de criação recém-criada pode ainda estar sendo gravado */
const FILE_GRACE = 60_000;

const keyOf = (c: Collection, id: string) => `${c}/${id}`;
const splitKey = (k: string) => {
  const i = k.indexOf("/");
  return [k.slice(0, i) as Collection, k.slice(i + 1)] as const;
};

/** Garante esquema e tira barra do fim: "casa.tail1234.ts.net/" → "https://casa.tail1234.ts.net". */
export function normalizeUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

/** A mesma ordem que o store usa ao inserir. */
function order(c: Collection, xs: Rec[]): Rec[] {
  if (c === "feedEntries") return xs.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  if (c === "feeds" || c === "shelves") return xs.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  return xs.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

function strip(c: Collection, rec: Rec): Rec {
  const fields = LOCAL_ONLY[c];
  if (!fields) return rec;
  const out = { ...rec };
  for (const f of fields) delete out[f];
  return out;
}

function message(e: unknown): Pick<SyncStatus, "phase" | "error"> {
  if (e instanceof SyncHttpError) {
    if (e.status === 401) return { phase: "error", error: "O servidor recusou o token." };
    return { phase: "error", error: e.message };
  }
  return { phase: "offline", error: "Sem conexão com o servidor." };
}

/* ───────────────────────── motor ───────────────────────── */

/**
 * Sincronização feita à mão: o app lê e escreve sempre no store local;
 * cada mudança entra numa fila, que sobe quando há conexão. Depois o app
 * busca "tudo que mudou desde o cursor". Conflito: o último a editar vence.
 */
export function createSync(options: SyncOptions) {
  const { store: library, storage, files } = options;
  const secrets = options.secrets ?? storage;
  const doFetch: typeof fetch = options.fetch ?? ((...a) => fetch(...a));
  const every = options.interval ?? 60_000;

  const status = createStore<SyncStatus>(() => ({ url: null, phase: "off", pending: 0, pendingFiles: 0, keepFiles: false, ai: false }));

  let state: Persisted = { device: uid(), url: null, cursor: 0, outbox: {}, files: [], keepFiles: false };
  let token = "";
  /** mudanças vindas do servidor não voltam para a fila */
  let applying = false;
  let running: Promise<void> | null = null;
  let again = false;
  let loaded: Promise<void> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let soon: ReturnType<typeof setTimeout> | undefined;
  let tick: ReturnType<typeof setInterval> | undefined;
  let unwatch: (() => void) | undefined;
  /** arquivos que já falharam nesta sessão — não insiste em loop */
  const failedDownloads = new Set<string>();

  const active = () => !!state.url && !!token;

  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void storage.setItem(STATE_KEY, JSON.stringify(state)), 250);
  };

  const publish = () =>
    status.setState({
      url: state.url,
      pending: Object.keys(state.outbox).length,
      pendingFiles: state.files.length,
      keepFiles: state.keepFiles,
      lastSync: state.lastSync,
      ai: !!state.ai && active(),
      ...(!active() && { phase: "off" as const, error: undefined }),
    });

  const headers = (): Record<string, string> => ({ authorization: `Bearer ${token}` });

  async function raw(path: string, init: RequestInit = {}, timeout = 20_000, base = state.url): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      return await doFetch(`${base}${path}`, { ...init, headers: { ...headers(), ...(init.headers as Record<string, string>) }, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }

  async function api<T>(path: string, body?: unknown, base = state.url): Promise<T> {
    const res = await raw(
      path,
      body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      body === undefined ? 20_000 : 60_000,
      base,
    );
    if (!res.ok) throw new SyncHttpError(res.status, await res.text().catch(() => ""));
    return (await res.json()) as T;
  }

  /* ─────────── fila de envio ─────────── */

  function mark(c: Collection, id: string, ts: number, del = false) {
    state.outbox[keyOf(c, id)] = del ? { ts, del: true } : { ts };
  }

  /** Compara o estado antes/depois por referência — o store troca só o que mudou. */
  function watch() {
    return library.subscribe((next, prev) => {
      if (applying || !active() || !library.persist.hasHydrated()) return;
      const ts = Date.now();
      let changed = false;
      for (const c of COLLECTIONS) {
        const a = prev[c] as unknown as Rec[];
        const b = next[c] as unknown as Rec[];
        if (a === b) continue;
        const before = new Map(a.map((x) => [x.id, x]));
        for (const x of b) {
          const old = before.get(x.id);
          before.delete(x.id);
          if (old === x) continue;
          mark(c, x.id, ts);
          if (c === "creations" && !old) state.files.push(x.id);
          changed = true;
        }
        for (const id of before.keys()) {
          mark(c, id, ts, true);
          changed = true;
        }
      }
      if (!changed) return;
      save();
      publish();
      schedule(1500);
    });
  }

  /** Primeira vez com um servidor: tudo que já existe aqui entra na fila, com a data própria de cada item. */
  function seed() {
    const s = library.getState();
    for (const c of COLLECTIONS) {
      for (const x of s[c] as unknown as Rec[]) {
        if (options.isSample?.(c, x)) continue;
        state.outbox[keyOf(c, x.id)] ??= { ts: x.updatedAt ?? x.createdAt ?? 0 };
      }
    }
    state.files = s.creations.filter((c) => c.medium !== "folder").map((c) => c.id);
  }

  async function push() {
    const keys = Object.keys(state.outbox);
    if (!keys.length) return;
    const s = library.getState();
    const index = new Map<Collection, Map<string, Rec>>();
    const find = (c: Collection, id: string) => {
      if (!index.has(c)) index.set(c, new Map((s[c] as unknown as Rec[]).map((x) => [x.id, x])));
      return index.get(c)!.get(id);
    };

    let batch: Change[] = [];
    let sent: [string, number][] = [];
    let bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      const res = await api<PushResponse>(API.push, { device: state.device, changes: batch });
      for (const [k, ts] of sent) if (state.outbox[k]?.ts === ts) delete state.outbox[k];
      if (res.stale.length) apply(res.stale);
      batch = [];
      sent = [];
      bytes = 0;
      save();
      publish();
    };

    for (const k of keys) {
      const p = state.outbox[k];
      if (!p) continue;
      const [c, id] = splitKey(k);
      const rec = p.del ? undefined : find(c, id);
      // captura ainda lendo o link: espera ficar pronta
      if (rec?.status === "loading") continue;
      const change: Change = rec ? { collection: c, id, updatedAt: p.ts, data: strip(c, rec) } : { collection: c, id, updatedAt: p.ts, deleted: true };
      batch.push(change);
      sent.push([k, p.ts]);
      bytes += rec ? JSON.stringify(change.data).length : 64;
      if (batch.length >= BATCH || bytes >= BATCH_BYTES) await flush();
    }
    await flush();
  }

  /* ─────────── mudanças de fora ─────────── */

  function apply(changes: Change[]) {
    const s = library.getState();
    const groups = new Map<Collection, Change[]>();
    for (const ch of changes) {
      if (!COLLECTIONS.includes(ch.collection)) continue;
      groups.set(ch.collection, [...(groups.get(ch.collection) ?? []), ch]);
    }
    const patch: Partial<Record<Collection, Rec[]>> = {};
    for (const [c, list] of groups) {
      const map = new Map((s[c] as unknown as Rec[]).map((x) => [x.id, x]));
      let touched = false;
      for (const ch of list) {
        const k = keyOf(c, ch.id);
        const mine = state.outbox[k];
        // edição local mais nova ainda na fila: ela vence e sobe no próximo envio
        if (mine && mine.ts > ch.updatedAt) continue;
        delete state.outbox[k];
        if (ch.deleted) {
          touched = map.delete(ch.id) || touched;
          continue;
        }
        let next = ch.data as Rec;
        const prev = map.get(ch.id);
        for (const f of LOCAL_ONLY[c] ?? []) if (prev?.[f] !== undefined) next = { ...next, [f]: prev[f] };
        map.set(ch.id, next);
        touched = true;
      }
      if (touched) patch[c] = order(c, [...map.values()]);
    }
    if (Object.keys(patch).length) {
      applying = true;
      try {
        library.setState(patch as unknown as Partial<LibraryData>);
      } finally {
        applying = false;
      }
    }
    save();
    publish();
  }

  async function pull() {
    for (;;) {
      const r = await api<ChangesResponse>(`${API.changes}?since=${state.cursor}&device=${encodeURIComponent(state.device)}&limit=500`);
      if (r.changes.length) apply(r.changes);
      state.cursor = r.cursor;
      save();
      if (!r.more) break;
    }
  }

  /* ─────────── arquivos ─────────── */

  const fileUrl = (id: string) => `${state.url}${API.files}/${encodeURIComponent(id)}`;

  async function pushFiles() {
    if (!files) return void (state.files = []);
    for (const id of [...new Set(state.files)]) {
      const c = library.getState().creations.find((x) => x.id === id);
      const done = () => {
        state.files = state.files.filter((x) => x !== id);
        save();
        publish();
      };
      if (!c || c.medium === "folder") {
        done();
        continue;
      }
      if (!(await files.has(c))) {
        // ainda gravando? tenta de novo na próxima volta
        if (Date.now() - c.createdAt > FILE_GRACE) done();
        continue;
      }
      const head = await raw(`${API.files}/${encodeURIComponent(id)}`, { method: "HEAD" });
      if (head.status === 401) throw new SyncHttpError(401, "");
      if (!head.ok) await files.upload(c, fileUrl(id), headers());
      done();
    }
  }

  /** Muda a criação sem pôr na fila (ex.: o caminho do arquivo recém-baixado). */
  function patchLocal(id: string, patch: Partial<Creation>) {
    applying = true;
    try {
      library.setState((s) => ({ creations: s.creations.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
    } finally {
      applying = false;
    }
  }

  /** Sob demanda: baixa o original do servidor quando não está no aparelho. */
  async function ensureFile(c: Creation): Promise<boolean> {
    if (!files || c.medium === "folder") return false;
    if (await files.has(c)) return true;
    if (!active()) return false;
    try {
      const patch = await files.download(c, fileUrl(c.id), headers());
      if (patch) patchLocal(c.id, patch);
      return true;
    } catch {
      failedDownloads.add(c.id);
      return false;
    }
  }

  async function downloadMissing() {
    if (!files) return;
    for (const c of library.getState().creations) {
      if (!state.keepFiles || !active()) return;
      if (c.medium === "folder" || failedDownloads.has(c.id)) continue;
      if (!(await files.has(c))) await ensureFile(c);
    }
  }

  /* ─────────── ciclo ─────────── */

  function run(): Promise<void> {
    if (!active()) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      status.setState({ phase: "syncing" });
      try {
        do {
          again = false;
          await push();
          await pull();
          await pushFiles();
        } while (again);
        state.lastSync = Date.now();
        save();
        status.setState({ phase: "idle", error: undefined });
        publish();
        if (state.keepFiles) await downloadMissing();
      } catch (e) {
        status.setState(message(e));
      } finally {
        running = null;
      }
    })();
    return running;
  }

  function schedule(ms: number) {
    clearTimeout(soon);
    soon = setTimeout(() => void run(), ms);
  }

  async function refreshInfo(base = state.url) {
    const info = await api<ServerInfo>(API.info, undefined, base);
    if (info.app !== "myndshelf-server") throw new SyncHttpError(0, "Esse endereço não é um servidor do MyndShelf.");
    return info;
  }

  function load() {
    loaded ??= (async () => {
      const [raw, tok] = await Promise.all([storage.getItem(STATE_KEY), secrets.getItem(TOKEN_KEY)]);
      if (raw) state = { ...state, ...(JSON.parse(raw) as Persisted) };
      token = tok ?? "";
      await new Promise<void>((resolve) => (library.persist.hasHydrated() ? resolve() : library.persist.onFinishHydration(() => resolve())));
      publish();
    })();
    return loaded;
  }

  return {
    status,

    /** Carrega a fila, começa a vigiar o store e sincroniza de tempos em tempos. */
    async start() {
      await load();
      unwatch ??= watch();
      clearInterval(tick);
      tick = setInterval(() => void run(), every);
      if (active()) {
        void refreshInfo()
          .then((i) => {
            state.ai = i.ai;
            save();
            publish();
          })
          .catch(() => {});
        void run();
      }
    },

    stop() {
      unwatch?.();
      unwatch = undefined;
      clearInterval(tick);
      clearTimeout(soon);
    },

    /** Sincroniza agora (app voltou ao primeiro plano, rede voltou, botão "sincronizar"). */
    now: run,

    /**
     * Liga o aparelho a um servidor. Testa o endereço e o token antes de guardar.
     * Tudo que já existe aqui sobe; o que existe lá desce.
     */
    async connect(config: SyncConfig) {
      await load();
      const url = normalizeUrl(config.url);
      const previous = token;
      token = config.token.trim();
      try {
        const info = await refreshInfo(url);
        const ping = await raw(API.ping, {}, 15_000, url);
        if (!ping.ok) throw new SyncHttpError(ping.status, "");
        const changedServer = url !== state.url;
        state = { ...state, url, ai: info.ai, ...(changedServer && { cursor: 0, outbox: {}, files: [], lastSync: undefined }) };
        if (changedServer) seed();
        await secrets.setItem(TOKEN_KEY, token);
        await storage.setItem(STATE_KEY, JSON.stringify(state));
        publish();
        unwatch ??= watch();
        await run();
        return info;
      } catch (e) {
        token = previous;
        if (e instanceof SyncHttpError && e.status === 401) throw new SyncHttpError(401, "O servidor recusou o token.");
        if (e instanceof SyncHttpError) throw e;
        throw new Error("Não deu para falar com o servidor. Confira o endereço e se o Tailscale está ligado.");
      }
    },

    /** Volta ao modo só local. O acervo fica como está. */
    async disconnect() {
      await load();
      token = "";
      state = { ...state, url: null, cursor: 0, outbox: {}, files: [], lastSync: undefined, ai: false };
      await secrets.removeItem(TOKEN_KEY);
      await storage.setItem(STATE_KEY, JSON.stringify(state));
      status.setState({ phase: "off", error: undefined });
      publish();
    },

    /** Fixa tudo offline: baixa os originais da Estante que ainda não estão aqui. */
    setKeepFiles(on: boolean) {
      state.keepFiles = on;
      save();
      publish();
      if (on) {
        failedDownloads.clear();
        void downloadMissing();
      }
    },

    ensureFile,

    /** Cabeçalho de autenticação, para outras chamadas ao servidor. */
    authHeaders: (): Record<string, string> => (active() ? headers() : {}),

    /** Para a IA passar pelo servidor quando não há chave neste aparelho. */
    aiProxy(): { endpoint: string; headers: Record<string, string> } | null {
      if (!active() || !state.ai) return null;
      return { endpoint: `${state.url}${API.ai}`, headers: headers() };
    },
  };
}

export type Sync = ReturnType<typeof createSync>;
