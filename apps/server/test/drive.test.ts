import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { createLibraryStore } from "@myndshelf/core";
import { createSync, type FileAdapter } from "@myndshelf/sync";
import type { DriveChangesResponse, DriveItem, DriveListResponse } from "@myndshelf/sync/protocol";
import type { StateStorage } from "zustand/middleware";
import { createApp } from "../src/app";
import { openDb, type Db } from "../src/db";
import { safeName } from "../src/drive";

const TOKEN = "token-de-teste-com-mais-de-16";
const auth = { authorization: `Bearer ${TOKEN}` };
let dir: string;
let db: Db;
let server: ServerType;
let url: string;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "myndshelf-drive-"));
  db = openDb(join(dir, "test.db"));
  const app = createApp({ db, token: TOKEN, filesDir: join(dir, "files") });
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () => resolve());
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const memory = (): StateStorage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

function device() {
  const store = createLibraryStore(memory());
  const blobs = new Map<string, Uint8Array>();
  const files: FileAdapter = {
    has: async (c) => blobs.has(c.id),
    upload: async (c, u, h) => {
      const r = await fetch(u, { method: "PUT", headers: { ...h, "x-file-name": encodeURIComponent(c.fileName ?? "") }, body: blobs.get(c.id) });
      if (!r.ok) throw new Error(`upload ${r.status}`);
    },
    download: async (c, u, h) => {
      const r = await fetch(u, { headers: h });
      if (!r.ok) throw new Error(`download ${r.status}`);
      blobs.set(c.id, new Uint8Array(await r.arrayBuffer()));
    },
  };
  const sync = createSync({ store, storage: memory(), files, interval: 1e8 });
  return { store, sync, blobs };
}

const api = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const r = await fetch(`${url}/api/drive${path}`, { ...init, headers: { ...auth, ...(init.headers as Record<string, string>) } });
  assert.ok(r.ok, `${init.method ?? "GET"} ${path} → ${r.status}`);
  return (await r.json()) as T;
};

const list = () => api<DriveListResponse>("/items");
const upload = (name: string, bytes: number[], parent = "root") =>
  api<DriveItem>(`/files?parent=${parent}`, {
    method: "POST",
    headers: { "x-file-name": encodeURIComponent(name), "content-type": "application/octet-stream" },
    body: new Uint8Array(bytes),
  });

test("nomes seguros para qualquer sistema", () => {
  assert.equal(safeName('a/b:c*?"<>|.txt'), "a-b-c------.txt");
  assert.equal(safeName("CON"), "_CON");
  assert.equal(safeName("  fim. "), "fim");
  assert.equal(safeName(""), "Sem título");
});

test("a Estante aparece como pastas, e o drive escreve de volta no acervo", async () => {
  const a = device();
  await a.sync.start();
  await a.sync.connect({ url, token: TOKEN });

  // o app cria uma estante e duas criações de mesmo nome; só as com arquivo aparecem
  const shelf = a.store.getState().addShelf("Fotos/2025");
  const c1 = a.store.getState().addCreation({ title: "Praia", medium: "image", fileName: "praia.jpg", shelfId: shelf });
  a.blobs.set(c1, new Uint8Array([1]));
  await new Promise((r) => setTimeout(r, 2));
  const c2 = a.store.getState().addCreation({ title: "Praia de novo", medium: "image", fileName: "Praia.jpg", shelfId: shelf });
  a.blobs.set(c2, new Uint8Array([2]));
  a.store.getState().addCreation({ title: "Sem arquivo", medium: "object" });
  await a.sync.now();

  const { items, cursor } = await list();
  const folder = items.find((x) => x.id === shelf)!;
  assert.equal(folder.kind, "folder");
  assert.equal(folder.name, "Fotos-2025");
  const names = items.filter((x) => x.parentId === shelf).map((x) => x.name);
  assert.deepEqual(names.sort(), ["Praia (2).jpg", "praia.jpg"]);
  assert.equal(items.filter((x) => x.kind === "file").length, 2, "criação sem original fica de fora");

  // nada mudou → /changes vazio
  const none = await api<DriveChangesResponse>(`/changes?since=${cursor}`);
  assert.equal(none.items.length, 0);

  // soltar um arquivo na estante cria uma criação que chega ao app
  const novo = await upload("Roteiro final.pdf", [9, 9, 9], shelf);
  assert.equal(novo.parentId, shelf);
  assert.equal(novo.size, 3);
  await a.sync.now();
  const cr = a.store.getState().creations.find((c) => c.id === novo.id)!;
  assert.equal(cr.medium, "document");
  assert.equal(cr.title, "Roteiro final");
  assert.equal(cr.shelfId, shelf);
  assert.equal(await a.sync.ensureFile(cr), true);
  assert.deepEqual([...a.blobs.get(novo.id)!], [9, 9, 9]);

  const ch = await api<DriveChangesResponse>(`/changes?since=${cursor}`);
  assert.ok(ch.items.some((x) => x.id === novo.id));

  // renomear e mover para a raiz
  const moved = await api<DriveItem>(`/items/${novo.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Roteiro v2.pdf", parentId: "root" }) });
  assert.equal(moved.name, "Roteiro v2.pdf");
  assert.equal(moved.parentId, "root");
  await a.sync.now();
  const after1 = a.store.getState().creations.find((c) => c.id === novo.id)!;
  assert.equal(after1.title, "Roteiro v2");
  assert.equal(after1.shelfId, null);

  // conteúdo trocado: o app baixa de novo
  const before = moved.version;
  const edited = await api<DriveItem>(`/files/${novo.id}`, { method: "PUT", headers: { "content-type": "application/pdf" }, body: new Uint8Array([7, 7]) });
  assert.notEqual(edited.version, before);
  assert.equal(edited.contentVersion, 1);
  await a.sync.now();
  const after2 = a.store.getState().creations.find((c) => c.id === novo.id)!;
  assert.equal(after2.fileRev, 1);
  assert.equal(await a.sync.ensureFile(after2), true);
  assert.deepEqual([...a.blobs.get(novo.id)!], [7, 7]);

  // apagar o original de nome limpo: o vizinho perde o " (2)"
  const c1Id = c1;
  const mark = (await list()).cursor;
  await api(`/items/${c1Id}`, { method: "DELETE" });
  const after3 = await api<DriveChangesResponse>(`/changes?since=${mark}`);
  assert.ok(after3.items.some((x) => x.id === c1Id && x.deleted));
  assert.equal(after3.items.find((x) => x.id === c2)?.name, "Praia.jpg");
  await a.sync.now();
  assert.ok(!a.store.getState().creations.some((c) => c.id === c1Id));
  const head = await fetch(`${url}/api/files/${c1Id}`, { method: "HEAD", headers: auth });
  assert.equal(head.status, 404);

  // estante nova pelo drive; subpasta é recusada
  const pasta = await api<DriveItem>("/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Áudios" }) });
  assert.equal(pasta.kind, "folder");
  const sub = await fetch(`${url}/api/drive/folders`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ name: "x", parentId: pasta.id }) });
  assert.equal(sub.status, 422);

  // apagar a estante devolve as criações para a raiz
  await api(`/items/${shelf}`, { method: "DELETE" });
  await a.sync.now();
  assert.ok(!a.store.getState().shelves.some((s) => s.id === shelf));
  assert.equal(a.store.getState().creations.find((c) => c.id === c2)?.shelfId, null);
  assert.ok(a.store.getState().shelves.some((s) => s.name === "Áudios"));

  a.sync.stop();
});

test("o drive exige o token", async () => {
  const r = await fetch(`${url}/api/drive/items`);
  assert.equal(r.status, 401);
});
