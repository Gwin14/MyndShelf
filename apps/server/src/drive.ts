import { createHash } from "node:crypto";
import type { Hono } from "hono";
import type { Creation, Shelf } from "@myndshelf/types";
import { hueFrom, mediumFromFile, uid } from "@myndshelf/core";
import { API, DRIVE_ROOT, type Change, type DriveChangesResponse, type DriveItem, type DriveListResponse, type DrivePatch } from "@myndshelf/sync/protocol";
import type { Db } from "./db";

/**
 * O drive: a Estante vista como pastas, para as extensões do Finder, Explorer,
 * app Arquivos, Android e Linux. Estantes viram pastas na raiz; criações com
 * original no servidor viram arquivos (sem estante → direto na raiz).
 *
 * As extensões escrevem por aqui e o servidor transforma cada operação em
 * mudanças comuns do sync (aparelho "drive"), então os apps recebem tudo
 * pelo caminho de sempre.
 */

const DEVICE = "drive";
const MAX_NAME = 200;

interface Deps {
  db: Db;
  saveFile(id: string, body: ReadableStream, name: string | null, mime: string | null): Promise<number>;
  removeFile(id: string): Promise<void>;
}

/** Nome que serve em qualquer sistema de arquivos (Windows é o mais chato). */
export function safeName(name: string, fallback = "Sem título"): string {
  let s = name
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "-")
    .replace(/[. ]+$/, "")
    .trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)) s = `_${s}`;
  if (!s || s === "." || s === "..") s = fallback;
  if (s.length > MAX_NAME) {
    const dot = s.lastIndexOf(".");
    const ext = dot > 0 && s.length - dot <= 12 ? s.slice(dot) : "";
    s = s.slice(0, MAX_NAME - ext.length) + ext;
  }
  return s;
}

const splitExt = (name: string): [string, string] => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
};

const shortHash = (...xs: unknown[]) => createHash("sha1").update(JSON.stringify(xs)).digest("base64url").slice(0, 16);

type Row<T> = { data: T; updatedAt: number };

/**
 * A árvore inteira. Nomes repetidos na mesma pasta (sem diferenciar maiúsculas,
 * como no macOS e no Windows) ganham " (2)", " (3)"… pela ordem de criação.
 */
export function buildTree(shelves: Row<Shelf>[], creations: Row<Creation>[], sizes: Map<string, number>): DriveItem[] {
  const shelfIds = new Set(shelves.map((s) => s.data.id));
  const entries: (DriveItem & { stamp: number })[] = [];

  for (const { data: s, updatedAt } of shelves) {
    entries.push({ id: s.id, parentId: DRIVE_ROOT, kind: "folder", name: safeName(s.name, "Estante"), createdAt: s.createdAt, version: "", stamp: updatedAt });
  }
  for (const { data: c, updatedAt } of creations) {
    const size = sizes.get(c.id);
    if (size === undefined || c.medium === "folder") continue;
    const parentId = c.shelfId && shelfIds.has(c.shelfId) ? c.shelfId : DRIVE_ROOT;
    entries.push({
      id: c.id,
      parentId,
      kind: "file",
      name: safeName(c.fileName || c.title),
      size,
      mime: c.mime,
      createdAt: c.createdAt,
      contentVersion: c.fileRev ?? 0,
      version: "",
      stamp: updatedAt,
    });
  }

  // pastas primeiro, depois arquivos; em cada grupo, o mais antigo fica com o nome limpo
  entries.sort((a, b) => (a.kind === b.kind ? (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id) : a.kind === "folder" ? -1 : 1));
  const taken = new Map<string, Set<string>>();
  for (const e of entries) {
    const used = taken.get(e.parentId) ?? new Set<string>();
    taken.set(e.parentId, used);
    let name = e.name;
    const [base, ext] = e.kind === "file" ? splitExt(name) : [name, ""];
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})${ext}`;
    used.add(name.toLowerCase());
    e.name = name;
    e.version = shortHash(e.stamp, e.name, e.parentId, e.size, e.contentVersion);
  }
  return entries.map(({ stamp: _, ...item }) => item);
}

export function mountDrive(app: Hono, { db, saveFile, removeFile }: Deps) {
  const base = API.drive;

  const tree = () => buildTree(db.rows<Shelf>("shelves"), db.rows<Creation>("creations"), db.files.sizes());

  const write = (changes: Change[]) => {
    const { removedCreations } = db.push(DEVICE, changes);
    return removedCreations;
  };

  const shelfExists = (id: string) => id === DRIVE_ROOT || !!db.record("shelves", id);

  /* ─────────── leitura ─────────── */

  app.get(`${base}/items`, (c) => {
    // o cursor vem antes da leitura: o que for escrito no meio aparece de novo em /changes
    const cursor = db.cursor();
    return c.json<DriveListResponse>({ items: tree(), cursor });
  });

  app.get(`${base}/items/:id`, (c) => {
    const item = tree().find((x) => x.id === c.req.param("id"));
    return item ? c.json(item) : c.json({ error: "not found" }, 404);
  });

  /**
   * O que mudou desde o cursor. Um nome pode mudar por causa de um vizinho
   * (o " (2)" some quando o original é apagado), e uma exclusão não diz de que
   * pasta o item saiu. Por isso, se algo da Estante mudou, vai a árvore inteira
   * mais as exclusões, e a extensão compara pelo `version`. Um acervo pessoal é
   * pequeno o bastante para isso.
   */
  app.get(`${base}/changes`, (c) => {
    let since = Math.max(0, Number(c.req.query("since")) || 0);
    const gone = new Set<string>();
    let touched = false;
    let page;
    do {
      page = db.changesAll(since, 2000);
      since = page.cursor;
      for (const ch of page.changes) {
        if (ch.collection !== "shelves" && ch.collection !== "creations") continue;
        touched = true;
        if (ch.deleted) gone.add(ch.id);
      }
    } while (page.more);

    const items = touched ? tree() : [];
    const live = new Set(items.map((x) => x.id));
    for (const id of gone) {
      if (!live.has(id)) items.push({ id, parentId: DRIVE_ROOT, kind: "file", name: "", version: "", deleted: true });
    }
    return c.json<DriveChangesResponse>({ items, cursor: since, more: false, full: touched });
  });

  /* ─────────── escrita ─────────── */

  /** Arquivo novo solto numa pasta: vira uma criação. */
  app.post(`${base}/files`, async (c) => {
    const parent = c.req.query("parent") || DRIVE_ROOT;
    if (!shelfExists(parent)) return c.json({ error: "pasta não existe" }, 404);
    // corpo vazio vale: o Android cria o arquivo antes de escrever nele
    const body = c.req.raw.body ?? new Blob([]).stream();
    const rawName = c.req.header("x-file-name");
    const fileName = safeName(rawName ? decodeURIComponent(rawName) : "", "Arquivo");
    const mime = c.req.header("content-type")?.split(";")[0] || undefined;
    const id = uid();
    const size = await saveFile(id, body, fileName, mime ?? null);
    const now = Date.now();
    const title = splitExt(fileName)[0];
    const creation: Creation = {
      id,
      title,
      medium: mediumFromFile(fileName, mime),
      fileName,
      mime,
      size,
      shelfId: parent === DRIVE_ROOT ? null : parent,
      featured: false,
      hue: hueFrom(title),
      createdAt: now,
    };
    write([{ collection: "creations", id, updatedAt: now, data: creation }]);
    return c.json(tree().find((x) => x.id === id)!, 201);
  });

  /** Conteúdo trocado (arquivo editado e salvo no lugar). */
  app.put(`${base}/files/:id`, async (c) => {
    const id = c.req.param("id");
    const rec = db.record<Creation>("creations", id);
    if (!rec) return c.json({ error: "not found" }, 404);
    const body = c.req.raw.body ?? new Blob([]).stream();
    const mime = c.req.header("content-type")?.split(";")[0] || rec.data.mime;
    const size = await saveFile(id, body, rec.data.fileName ?? null, mime ?? null);
    const data: Creation = { ...rec.data, size, mime, fileRev: (rec.data.fileRev ?? 0) + 1 };
    // a prévia e a leitura eram do conteúdo antigo
    delete data.preview;
    delete data.analysis;
    write([{ collection: "creations", id, updatedAt: Math.max(Date.now(), rec.updatedAt + 1), data }]);
    return c.json(tree().find((x) => x.id === id));
  });

  /** Estante nova (só na raiz: estantes não têm subpastas). */
  app.post(`${base}/folders`, async (c) => {
    const body = await c.req.json<{ name?: string; parentId?: string }>().catch(() => null);
    if (!body?.name?.trim()) return c.json({ error: "nome vazio" }, 400);
    if (body.parentId && body.parentId !== DRIVE_ROOT) return c.json({ error: "estantes não têm subpastas" }, 422);
    const now = Date.now();
    const shelf: Shelf = { id: uid(), name: body.name.trim().slice(0, MAX_NAME), createdAt: now };
    write([{ collection: "shelves", id: shelf.id, updatedAt: now, data: shelf }]);
    return c.json(tree().find((x) => x.id === shelf.id)!, 201);
  });

  /** Renomear e/ou mover. */
  app.patch(`${base}/items/:id`, async (c) => {
    const id = c.req.param("id");
    const patch = await c.req.json<DrivePatch>().catch(() => null);
    if (!patch) return c.json({ error: "bad request" }, 400);
    const name = patch.name?.trim();

    const shelf = db.record<Shelf>("shelves", id);
    if (shelf) {
      if (patch.parentId && patch.parentId !== DRIVE_ROOT) return c.json({ error: "estantes não têm subpastas" }, 422);
      if (name && name !== shelf.data.name) {
        write([{ collection: "shelves", id, updatedAt: Math.max(Date.now(), shelf.updatedAt + 1), data: { ...shelf.data, name: name.slice(0, MAX_NAME) } }]);
      }
      return c.json(tree().find((x) => x.id === id));
    }

    const cr = db.record<Creation>("creations", id);
    if (!cr) return c.json({ error: "not found" }, 404);
    const data: Creation = { ...cr.data };
    if (patch.parentId !== undefined) {
      if (!shelfExists(patch.parentId)) return c.json({ error: "pasta não existe" }, 404);
      data.shelfId = patch.parentId === DRIVE_ROOT ? null : patch.parentId;
    }
    if (name) {
      const fileName = safeName(name);
      const oldName = cr.data.fileName ?? "";
      // o título acompanha o nome só se ainda era o nome do arquivo (não um título escolhido no app)
      if (!cr.data.title || cr.data.title === oldName || cr.data.title === splitExt(oldName)[0]) data.title = splitExt(fileName)[0];
      data.fileName = fileName;
    }
    write([{ collection: "creations", id, updatedAt: Math.max(Date.now(), cr.updatedAt + 1), data }]);
    return c.json(tree().find((x) => x.id === id));
  });

  /** Apagar. Uma estante apagada devolve as criações para a raiz, como no app. */
  app.delete(`${base}/items/:id`, async (c) => {
    const id = c.req.param("id");
    const now = Date.now();
    const shelf = db.record<Shelf>("shelves", id);
    if (shelf) {
      const freed = db
        .rows<Creation>("creations")
        .filter((r) => r.data.shelfId === id)
        .map<Change>((r) => ({ collection: "creations", id: r.data.id, updatedAt: Math.max(now, r.updatedAt + 1), data: { ...r.data, shelfId: null } }));
      write([{ collection: "shelves", id, updatedAt: Math.max(now, shelf.updatedAt + 1), deleted: true }, ...freed]);
      return c.json({ ok: true });
    }
    const cr = db.record<Creation>("creations", id);
    if (!cr) return c.json({ ok: true });
    for (const gone of write([{ collection: "creations", id, updatedAt: Math.max(now, cr.updatedAt + 1), deleted: true }])) await removeFile(gone);
    return c.json({ ok: true });
  });
}
