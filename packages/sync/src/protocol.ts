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
  drive: "/api/drive",
} as const;

/* ───────────────────────── drive: a Estante como pastas no Finder/Explorer ───────────────────────── */

/** Pasta-raiz do drive. Arquivos sem estante ficam nela; cada estante é uma pasta. */
export const DRIVE_ROOT = "root";

/**
 * Um item do drive. Pastas são estantes; arquivos são criações com original no servidor.
 * `name` já vem pronto para o disco (sem caracteres proibidos, sem repetição na mesma pasta).
 */
export interface DriveItem {
  id: string;
  parentId: string;
  kind: "folder" | "file";
  name: string;
  size?: number;
  mime?: string;
  createdAt?: number;
  /** muda quando nome, pasta, tamanho ou conteúdo mudam (inclusive por causa de um vizinho de mesmo nome) */
  version: string;
  /** muda só quando o conteúdo do arquivo muda */
  contentVersion?: number;
  deleted?: true;
}

/** GET /api/drive/items */
export interface DriveListResponse {
  items: DriveItem[];
  /** passe como `since` em /api/drive/changes */
  cursor: number;
}

/** GET /api/drive/changes?since=<cursor> */
export interface DriveChangesResponse {
  items: DriveItem[];
  cursor: number;
  more: boolean;
}

/** PATCH /api/drive/items/:id */
export interface DrivePatch {
  name?: string;
  parentId?: string;
}

/** Campos que só valem no aparelho de origem e nunca saem dele. */
export const LOCAL_ONLY: Partial<Record<Collection, string[]>> = {
  creations: ["filePath"],
};
