/* ───────────────────────── contrato entre os apps e o servidor ───────────────────────── */

/** Coleções do acervo que sincronizam. Cada uma vira linhas `(collection, id)` no servidor. */
export const COLLECTIONS = ["captures", "feeds", "feedEntries", "creations", "shelves", "projects"] as const;
export type Collection = (typeof COLLECTIONS)[number];

export const isCollection = (c: unknown): c is Collection => COLLECTIONS.includes(c as Collection);

/**
 * Uma mudança: a versão inteira do registro (ou a marca de apagado) e quando foi feita.
 * O último a editar vence, comparando `updatedAt`.
 */
export interface Change {
  collection: Collection;
  id: string;
  /** ms desde 1970, no relógio de quem editou */
  updatedAt: number;
  /** soft delete: a linha continua no servidor para a exclusão chegar aos outros aparelhos */
  deleted?: boolean;
  data?: unknown;
}

/** POST /api/sync/push */
export interface PushRequest {
  device: string;
  changes: Change[];
}

export interface PushResponse {
  accepted: number;
  /** o servidor já tinha uma versão mais nova destes: vão de volta para o aparelho aplicar */
  stale: Change[];
}

/** GET /api/sync/changes?since=<cursor>&device=<id>&limit=<n> */
export interface ChangesResponse {
  changes: Change[];
  /** passe como `since` na próxima chamada */
  cursor: number;
  more: boolean;
}

/** GET /api/info (sem token) */
export interface ServerInfo {
  app: "myndshelf-server";
  version: string;
  /** o servidor tem chave do Gemini e atende /api/ai/… */
  ai: boolean;
}

export const API = {
  info: "/api/info",
  ping: "/api/ping",
  push: "/api/sync/push",
  changes: "/api/sync/changes",
  files: "/api/files",
  search: "/api/search",
  ai: "/api/ai/gemini",
} as const;

/** Campos que só valem no aparelho de origem e nunca saem dele. */
export const LOCAL_ONLY: Partial<Record<Collection, string[]>> = {
  creations: ["filePath"],
};
