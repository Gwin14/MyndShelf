import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { createLibraryStore } from "@myndshelf/core";
import { createSync, type FileAdapter } from "@myndshelf/sync";
import type { StateStorage } from "zustand/middleware";
import { createApp } from "../src/app";
import { openDb, type Db } from "../src/db";

const TOKEN = "token-de-teste-com-mais-de-16";
let dir: string;
let db: Db;
let server: ServerType;
let url: string;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "myndshelf-"));
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

/** Um aparelho: store + fila + arquivos em memória + chave de rede. */
function device() {
  const store = createLibraryStore(memory());
  const blobs = new Map<string, Uint8Array>();
  let online = true;
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
  const sync = createSync({
    store,
    storage: memory(),
    files,
    interval: 1e8,
    fetch: (async (...a: Parameters<typeof fetch>) => {
      if (!online) throw new TypeError("network down");
      return fetch(...a);
    }) as typeof fetch,
  });
  return { store, sync, blobs, setOnline: (v: boolean) => (online = v) };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("token errado é recusado", async () => {
  const a = device();
  await assert.rejects(a.sync.connect({ url, token: "errado-errado-errado" }), /recusou o token/);
  assert.equal(a.sync.status.getState().url, null);
});

test("dois aparelhos sincronizam criação, edição, conflito, exclusão e arquivos", async () => {
  const a = device();
  const b = device();
  await a.sync.start();
  await b.sync.start();

  // A já tinha coisas antes de ligar ao servidor
  const old = a.store.getState().addCapture({ title: "Antigo", kind: "note", note: "feito offline" });
  await a.sync.connect({ url, token: TOKEN });
  assert.equal(a.sync.status.getState().pending, 0);

  const cap = a.store.getState().addCapture({ title: "Café com leite", kind: "note", tags: ["bebida"] });
  await a.sync.now();

  await b.sync.connect({ url, token: TOKEN });
  const ids = b.store.getState().captures.map((c) => c.id);
  assert.deepEqual(new Set(ids), new Set([old, cap]));

  // conflito: B edita, depois A edita — A vence
  b.store.getState().updateCapture(cap, { title: "Versão B" });
  await wait(5);
  a.store.getState().updateCapture(cap, { title: "Versão A" });
  await b.sync.now();
  await a.sync.now();
  await b.sync.now();
  assert.equal(b.store.getState().captures.find((c) => c.id === cap)?.title, "Versão A");
  assert.equal(a.store.getState().captures.find((c) => c.id === cap)?.title, "Versão A");

  // escrita offline: fica na fila e sobe quando a conexão volta
  b.setOnline(false);
  const offline = b.store.getState().addCapture({ title: "Escrito no ônibus", kind: "note" });
  b.store.getState().removeCapture(old);
  await b.sync.now();
  assert.equal(b.sync.status.getState().phase, "offline");
  assert.ok(b.sync.status.getState().pending >= 2);
  b.setOnline(true);
  await b.sync.now();
  assert.equal(b.sync.status.getState().pending, 0);
  await a.sync.now();
  const aIds = a.store.getState().captures.map((c) => c.id);
  assert.ok(aIds.includes(offline));
  assert.ok(!aIds.includes(old), "exclusão sincronizou");

  // arquivos: sobem de A, B baixa sob demanda
  const cr = a.store.getState().addCreation({ title: "Foto", medium: "image", fileName: "foto.jpg", filePath: "/Users/a/foto.jpg" });
  a.blobs.set(cr, new Uint8Array([1, 2, 3, 4]));
  await a.sync.now();
  assert.equal(a.sync.status.getState().pendingFiles, 0);
  await b.sync.now();
  const bc = b.store.getState().creations.find((c) => c.id === cr)!;
  assert.equal(bc.filePath, undefined, "caminho de disco não sai do aparelho");
  assert.equal(await b.sync.ensureFile(bc), true);
  assert.deepEqual([...b.blobs.get(cr)!], [1, 2, 3, 4]);

  // apagar a criação tira o arquivo do servidor
  a.store.getState().removeCreation(cr);
  await a.sync.now();
  const head = await fetch(`${url}/api/files/${cr}`, { method: "HEAD", headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(head.status, 404);

  // busca de texto ignora acentos
  const res = await fetch(`${url}/api/search?q=onibus`, { headers: { authorization: `Bearer ${TOKEN}` } });
  const hits = (await res.json()) as { id: string }[];
  assert.ok(hits.some((h) => h.id === offline));

  // snapshot no formato do backup
  const lib = (await (await fetch(`${url}/api/library`, { headers: { authorization: `Bearer ${TOKEN}` } })).json()) as { app: string; data: { captures: unknown[] } };
  assert.equal(lib.app, "myndshelf");
  assert.equal(lib.data.captures.length, 2);

  a.sync.stop();
  b.sync.stop();
});

test("IA sem chave no servidor responde 503 e o app não usa o proxy", async () => {
  const r = await fetch(`${url}/api/ai/gemini/gemini-flash-lite-latest:generateContent`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(r.status, 503);
  const info = (await (await fetch(`${url}/api/info`)).json()) as { ai: boolean };
  assert.equal(info.ai, false);
});
