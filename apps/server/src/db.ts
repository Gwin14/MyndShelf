import { DatabaseSync } from "node:sqlite";
import type { LibraryData } from "@myndshelf/types";
import { COLLECTIONS, isCollection, type Change, type ChangesResponse, type Collection, type PushResponse } from "@myndshelf/sync/protocol";

interface Row {
  collection: Collection;
  id: string;
  data: string | null;
  updated_at: number;
  deleted: number;
  seq: number;
}

export interface SearchHit {
  collection: Collection;
  id: string;
  title: string;
  snippet: string;
}

const MAX_ID = 512;

/**
 * Banco do servidor: uma linha por registro do acervo, guardado inteiro em JSON.
 * `seq` cresce a cada escrita e é o cursor de "tudo que mudou desde X".
 */
export function openDb(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS records (
      collection TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       TEXT,
      updated_at INTEGER NOT NULL,
      deleted    INTEGER NOT NULL DEFAULT 0,
      device     TEXT,
      seq        INTEGER NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS records_seq ON records (seq);

    CREATE TABLE IF NOT EXISTS files (
      id         TEXT PRIMARY KEY,
      name       TEXT,
      mime       TEXT,
      size       INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5 (
      collection UNINDEXED, id UNINDEXED, title, body, tags,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);

  let seq = (db.prepare("SELECT coalesce(max(seq), 0) AS s FROM records").get() as { s: number }).s;

  const q = {
    get: db.prepare("SELECT * FROM records WHERE collection = ? AND id = ?"),
    upsert: db.prepare(`
      INSERT INTO records (collection, id, data, updated_at, deleted, device, seq) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (collection, id) DO UPDATE SET
        data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, device = excluded.device, seq = excluded.seq
    `),
    since: db.prepare("SELECT * FROM records WHERE seq > ? AND (device IS NULL OR device != ?) ORDER BY seq LIMIT ?"),
    unindex: db.prepare("DELETE FROM search WHERE collection = ? AND id = ?"),
    index: db.prepare("INSERT INTO search (collection, id, title, body, tags) VALUES (?, ?, ?, ?, ?)"),
    live: db.prepare("SELECT data FROM records WHERE collection = ? AND deleted = 0"),
    liveRows: db.prepare("SELECT data, updated_at FROM records WHERE collection = ? AND deleted = 0"),
    touch: db.prepare("UPDATE records SET seq = ? WHERE collection = ? AND id = ?"),
    sinceAll: db.prepare("SELECT * FROM records WHERE seq > ? ORDER BY seq LIMIT ?"),
    fileAll: db.prepare("SELECT id, size FROM files"),
    fileGet: db.prepare("SELECT * FROM files WHERE id = ?"),
    filePut: db.prepare(`
      INSERT INTO files (id, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET name = excluded.name, mime = excluded.mime, size = excluded.size
    `),
    fileDel: db.prepare("DELETE FROM files WHERE id = ?"),
    search: db.prepare(`
      SELECT collection, id, title, snippet(search, 3, '[', ']', '…', 12) AS snippet
      FROM search WHERE search MATCH ? ORDER BY rank LIMIT ?
    `),
  };

  const toChange = (r: Row): Change => ({
    collection: r.collection,
    id: r.id,
    updatedAt: r.updated_at,
    ...(r.deleted ? { deleted: true } : { data: JSON.parse(r.data ?? "null") }),
  });

  /** O que entra na busca de texto de cada tipo de registro. */
  function indexRecord(c: Collection, id: string, data: Record<string, unknown> | null) {
    q.unindex.run(c, id);
    if (!data) return;
    const s = (...xs: unknown[]) => xs.filter((x) => typeof x === "string" && x).join("\n");
    const tags = Array.isArray(data.tags) ? data.tags.join(" ") : "";
    if (c === "captures") q.index.run(c, id, s(data.title), s(data.description, data.note, data.siteName, data.author, data.url), tags);
    else if (c === "creations") q.index.run(c, id, s(data.title), s(data.notes, data.fileName, data.analysis), tags);
    else if (c === "projects") {
      const texts = Array.isArray(data.nodes) ? (data.nodes as { text?: string }[]).map((n) => n.text) : [];
      q.index.run(c, id, s(data.name), s(data.description, ...texts), "");
    } else if (c === "feedEntries") q.index.run(c, id, s(data.title), s(data.summary, data.author), "");
  }

  const tx = <T>(fn: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      db.exec("COMMIT");
      return out;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };

  return {
    /**
     * Grava as mudanças de um aparelho. O último a editar vence: se o servidor
     * já tem uma versão mais nova, ela volta em `stale` e nada é gravado.
     * Devolve também as criações apagadas, para o arquivo sair do disco.
     */
    push(device: string, changes: Change[]): PushResponse & { removedCreations: string[] } {
      return tx(() => {
        const stale: Change[] = [];
        const removedCreations: string[] = [];
        let accepted = 0;
        for (const ch of changes) {
          if (!isCollection(ch.collection) || typeof ch.id !== "string" || !ch.id || ch.id.length > MAX_ID) continue;
          if (typeof ch.updatedAt !== "number" || !Number.isFinite(ch.updatedAt)) continue;
          const existing = q.get.get(ch.collection, ch.id) as Row | undefined;
          if (existing && existing.updated_at > ch.updatedAt) {
            stale.push(toChange(existing));
            continue;
          }
          const data = ch.deleted ? null : ((ch.data ?? null) as Record<string, unknown> | null);
          if (!ch.deleted && (!data || typeof data !== "object")) continue;
          q.upsert.run(ch.collection, ch.id, data && JSON.stringify({ ...data, id: ch.id }), ch.updatedAt, ch.deleted ? 1 : 0, device, ++seq);
          indexRecord(ch.collection, ch.id, data);
          if (ch.deleted && ch.collection === "creations") removedCreations.push(ch.id);
          accepted++;
        }
        return { accepted, stale, removedCreations };
      });
    },

    /** Tudo que mudou depois de `since`, menos o que veio do próprio aparelho. */
    changes(since: number, device: string, limit: number): ChangesResponse {
      const rows = q.since.all(since, device, limit + 1) as unknown as Row[];
      const more = rows.length > limit;
      const page = rows.slice(0, limit);
      return { changes: page.map(toChange), cursor: more ? page[page.length - 1].seq : seq, more };
    },

    /** O acervo inteiro, no formato do backup dos apps. */
    snapshot(): LibraryData {
      const out = {} as Record<Collection, unknown[]>;
      for (const c of COLLECTIONS) out[c] = (q.live.all(c) as { data: string }[]).map((r) => JSON.parse(r.data));
      return out as unknown as LibraryData;
    },

    /** Um registro vivo, com quando foi editado. */
    record<T = Record<string, unknown>>(c: Collection, id: string): { data: T; updatedAt: number } | undefined {
      const r = q.get.get(c, id) as Row | undefined;
      return r && !r.deleted ? { data: JSON.parse(r.data ?? "null") as T, updatedAt: r.updated_at } : undefined;
    },

    /** Os registros vivos de uma coleção, com quando foram editados. */
    rows<T = Record<string, unknown>>(c: Collection): { data: T; updatedAt: number }[] {
      return (q.liveRows.all(c) as { data: string; updated_at: number }[]).map((r) => ({ data: JSON.parse(r.data) as T, updatedAt: r.updated_at }));
    },

    /**
     * Avisa que o registro mudou sem mexer nele (ex.: o arquivo da criação acabou de subir).
     * Não muda `updated_at` nem o aparelho de origem: só entra de novo em "mudanças desde X".
     */
    touch(c: Collection, id: string) {
      tx(() => q.touch.run(++seq, c, id));
    },

    /** Como `changes`, mas inclui tudo (o drive quer ver até o que ele mesmo escreveu). */
    changesAll(since: number, limit: number): ChangesResponse {
      const rows = q.sinceAll.all(since, limit + 1) as unknown as Row[];
      const more = rows.length > limit;
      const page = rows.slice(0, limit);
      return { changes: page.map(toChange), cursor: more ? page[page.length - 1].seq : seq, more };
    },

    cursor: () => seq,

    search(text: string, limit = 30): SearchHit[] {
      const words = text.match(/[\p{L}\p{N}]+/gu);
      if (!words?.length) return [];
      const match = words.map((w) => `"${w}"*`).join(" ");
      return q.search.all(match, limit) as unknown as SearchHit[];
    },

    files: {
      get: (id: string) => q.fileGet.get(id) as { id: string; name: string | null; mime: string | null; size: number } | undefined,
      put: (id: string, name: string | null, mime: string | null, size: number) => q.filePut.run(id, name, mime, size, Date.now()),
      remove: (id: string) => q.fileDel.run(id),
      /** id → tamanho de todos os originais guardados */
      sizes: () => new Map((q.fileAll.all() as { id: string; size: number }[]).map((r) => [r.id, r.size])),
    },

    close: () => db.close(),
  };
}

export type Db = ReturnType<typeof openDb>;
