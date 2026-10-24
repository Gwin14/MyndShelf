import type { LibraryData } from "@myndshelf/types";

export const BACKUP_VERSION = 1;

export interface LibraryBackup {
  app: "myndshelf";
  version: number;
  exportedAt: number;
  /** de onde saiu: "desktop", "mobile"… */
  source?: string;
  data: LibraryData;
}

const KEYS = ["captures", "feeds", "feedEntries", "creations", "shelves", "projects"] as const;

/**
 * Cópia do acervo em JSON, legível por qualquer app do MyndShelf.
 * As criações vão com metadados e prévia; os arquivos originais ficam no aparelho.
 */
export function serializeLibrary(data: LibraryData, source?: string): string {
  const backup: LibraryBackup = {
    app: "myndshelf",
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    source,
    data: {
      captures: data.captures.filter((c) => c.status !== "loading"),
      feeds: data.feeds,
      feedEntries: data.feedEntries,
      // caminhos de disco só valem no aparelho de origem
      creations: data.creations.map(({ filePath: _path, ...c }) => c),
      shelves: data.shelves,
      projects: data.projects,
    },
  };
  return JSON.stringify(backup);
}

export class BackupError extends Error {}

export function parseBackup(text: string): LibraryBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("O arquivo não é um JSON válido.");
  }
  const b = raw as Partial<LibraryBackup>;
  if (!b || b.app !== "myndshelf" || typeof b.data !== "object" || !b.data) {
    throw new BackupError("Este arquivo não é um acervo do MyndShelf.");
  }
  if ((b.version ?? 0) > BACKUP_VERSION) throw new BackupError("Acervo feito por uma versão mais nova do app.");
  const data = {} as LibraryData;
  for (const k of KEYS) {
    const v = (b.data as Partial<LibraryData>)[k];
    (data as unknown as Record<string, unknown[]>)[k] = Array.isArray(v) ? v : [];
  }
  return { app: "myndshelf", version: b.version ?? BACKUP_VERSION, exportedAt: b.exportedAt ?? 0, source: b.source, data };
}

/** Junta dois acervos por id; o que vem de fora vence quando o mesmo item existe dos dois lados. */
export function mergeLibrary(current: LibraryData, incoming: LibraryData): LibraryData {
  const merge = <T extends { id: string }>(a: T[], b: T[]) => {
    const byId = new Map(a.map((x) => [x.id, x]));
    for (const x of b) byId.set(x.id, { ...byId.get(x.id), ...x });
    return [...byId.values()];
  };
  const byDate = <T extends { createdAt: number }>(xs: T[]) => xs.sort((x, y) => y.createdAt - x.createdAt);
  return {
    captures: byDate(merge(current.captures, incoming.captures)),
    feeds: merge(current.feeds, incoming.feeds),
    feedEntries: merge(current.feedEntries, incoming.feedEntries).sort((x, y) => y.publishedAt - x.publishedAt),
    creations: byDate(merge(current.creations, incoming.creations)),
    shelves: merge(current.shelves, incoming.shelves),
    projects: merge(current.projects, incoming.projects),
  };
}

export function backupCounts(data: LibraryData) {
  return { captures: data.captures.length, creations: data.creations.length, projects: data.projects.length, feeds: data.feeds.length };
}
