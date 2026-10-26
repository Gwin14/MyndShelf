import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { serializeLibrary } from "@myndshelf/core";
import { API, type PushRequest, type ServerInfo } from "@myndshelf/sync/protocol";
import type { Db } from "./db";

export interface AppOptions {
  db: Db;
  filesDir: string;
  token: string;
  geminiKey?: string;
  /** build estático do site (apps/desktop/dist); servido na raiz quando existe */
  publicDir?: string;
  version?: string;
}

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";
const UA = "Mozilla/5.0 (compatible; MyndShelfBot/0.1; link preview)";
const FILE_ID = /^[\w-]{1,128}$/;

const digest = (s: string) => createHash("sha256").update(s).digest();

export function createApp(o: AppOptions) {
  const app = new Hono();
  const expected = digest(o.token);

  /** Token simples no cabeçalho; o Tailscale já cuida de quem alcança o servidor. */
  const auth: MiddlewareHandler = async (c, next) => {
    const given = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!given || !timingSafeEqual(digest(given), expected)) return c.json({ error: "unauthorized" }, 401);
    await next();
  };

  // o app desktop (tauri://localhost) e o Expo falam com o servidor de outra origem
  app.use(
    "/api/*",
    cors({ origin: "*", allowHeaders: ["authorization", "content-type", "x-file-name"], allowMethods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"], maxAge: 86400 }),
  );

  app.get(API.info, (c) => c.json<ServerInfo>({ app: "myndshelf-server", version: o.version ?? "0.0.0", ai: !!o.geminiKey }));

  app.use("/api/*", auth);
  app.use("/__og", auth);
  app.use("/__resolve", auth);

  app.get(API.ping, (c) => c.json({ ok: true }));

  /* ─────────── sincronização ─────────── */

  app.post(API.push, async (c) => {
    const body = await c.req.json<PushRequest>().catch(() => null);
    if (!body || typeof body.device !== "string" || !Array.isArray(body.changes)) return c.json({ error: "bad request" }, 400);
    const { removedCreations, ...res } = o.db.push(body.device, body.changes);
    for (const id of removedCreations) await removeFile(id);
    return c.json(res);
  });

  app.get(API.changes, (c) => {
    const since = Math.max(0, Number(c.req.query("since")) || 0);
    const limit = Math.min(2000, Math.max(1, Number(c.req.query("limit")) || 500));
    return c.json(o.db.changes(since, c.req.query("device") ?? "", limit));
  });

  /** Cópia do acervo no mesmo JSON do "Exportar" dos apps. */
  app.get("/api/library", (c) => {
    c.header("content-disposition", `attachment; filename="myndshelf-acervo-${new Date().toISOString().slice(0, 10)}.json"`);
    return c.body(serializeLibrary(o.db.snapshot(), "servidor"), 200, { "content-type": "application/json" });
  });

  app.get(API.search, (c) => c.json(o.db.search(c.req.query("q") ?? "", Math.min(100, Number(c.req.query("limit")) || 30))));

  /* ─────────── arquivos: pasta em disco, um por id ─────────── */

  const fileOf = (id: string) => join(o.filesDir, id);

  async function removeFile(id: string) {
    if (!FILE_ID.test(id)) return;
    await rm(fileOf(id), { force: true });
    o.db.files.remove(id);
  }

  app.on(["GET", "HEAD"], `${API.files}/:id`, async (c) => {
    const id = c.req.param("id");
    const meta = FILE_ID.test(id) ? o.db.files.get(id) : undefined;
    if (!meta || !existsSync(fileOf(id))) return c.body(null, 404);
    const headers: Record<string, string> = {
      "content-type": meta.mime || "application/octet-stream",
      "content-length": String(meta.size),
      "cache-control": "private, max-age=31536000, immutable",
    };
    if (meta.name) headers["content-disposition"] = `inline; filename*=UTF-8''${encodeURIComponent(meta.name)}`;
    if (c.req.method === "HEAD") return c.body(null, 200, headers);
    return c.body(Readable.toWeb(createReadStream(fileOf(id))) as ReadableStream, 200, headers);
  });

  app.put(`${API.files}/:id`, async (c) => {
    const id = c.req.param("id");
    if (!FILE_ID.test(id)) return c.json({ error: "bad id" }, 400);
    const body = c.req.raw.body;
    if (!body) return c.json({ error: "empty" }, 400);
    await mkdir(o.filesDir, { recursive: true });
    const tmp = `${fileOf(id)}.${process.pid}.${Date.now()}.part`;
    try {
      await pipeline(Readable.fromWeb(body as never), createWriteStream(tmp));
      await rename(tmp, fileOf(id));
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
    const { size } = await stat(fileOf(id));
    const name = c.req.header("x-file-name");
    o.db.files.put(id, name ? decodeURIComponent(name) : null, c.req.header("content-type") ?? null, size);
    return c.json({ ok: true, size });
  });

  app.delete(`${API.files}/:id`, async (c) => {
    await removeFile(c.req.param("id"));
    return c.json({ ok: true });
  });

  /* ─────────── IA: a chave fica aqui ─────────── */

  app.post(`${API.ai}/:target`, async (c) => {
    if (!o.geminiKey) return c.json({ error: { message: "O servidor não tem chave do Gemini (GEMINI_API_KEY)." } }, 503);
    const target = c.req.param("target");
    if (!/^[\w.-]+:\w+$/.test(target)) return c.json({ error: "bad target" }, 400);
    const query = new URL(c.req.url).search;
    const upstream = await fetch(`${GEMINI}/${target}${query}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": o.geminiKey },
      body: c.req.raw.body,
      signal: c.req.raw.signal,
      duplex: "half",
    } as RequestInit);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  });

  /* ─────────── leitura de links para o site (o desktop usa o Rust) ─────────── */

  const target = (raw: string | undefined) => (raw && /^https?:\/\//.test(raw) ? raw : null);

  app.get("/__og", async (c) => {
    const url = target(c.req.query("url"));
    if (!url) return c.body(null, 400);
    try {
      const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
      return c.text((await r.text()).slice(0, 2_500_000));
    } catch {
      return c.body(null, 502);
    }
  });

  app.get("/__resolve", async (c) => {
    const url = target(c.req.query("url"));
    if (!url) return c.body(null, 400);
    try {
      const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
      return c.text(r.url);
    } catch {
      return c.body(null, 502);
    }
  });

  /* ─────────── site: o build estático na mesma origem ─────────── */

  if (o.publicDir && existsSync(join(o.publicDir, "index.html"))) {
    const root = resolve(o.publicDir);
    const MIME: Record<string, string> = {
      html: "text/html; charset=utf-8", js: "text/javascript", mjs: "text/javascript", css: "text/css", json: "application/json",
      svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", ico: "image/x-icon", webp: "image/webp",
      woff: "font/woff", woff2: "font/woff2", wasm: "application/wasm", map: "application/json", txt: "text/plain",
    };
    app.get("*", async (c) => {
      const path = resolve(root, `.${decodeURIComponent(new URL(c.req.url).pathname)}`);
      if (relative(root, path).startsWith("..")) return c.body(null, 404);
      const file = existsSync(path) && (await stat(path)).isFile() ? path : join(root, "index.html");
      const ext = file.split(".").pop() ?? "";
      const asset = file.includes(`${root}/assets/`);
      return c.body(await readFile(file), 200, {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "cache-control": asset ? "public, max-age=31536000, immutable" : "no-cache",
      });
    });
  }

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal" }, 500);
  });

  return app;
}
