import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { openDb } from "./db";

const env = process.env;
const token = env.MYNDSHELF_TOKEN?.trim();
if (!token || token.length < 16) {
  console.error("Defina MYNDSHELF_TOKEN com pelo menos 16 caracteres (ex.: `openssl rand -hex 32`).");
  process.exit(1);
}

const dataDir = env.DATA_DIR ?? "./data";
mkdirSync(join(dataDir, "files"), { recursive: true });

const db = openDb(join(dataDir, "myndshelf.db"));
const app = createApp({
  db,
  token,
  filesDir: join(dataDir, "files"),
  geminiKey: env.GEMINI_API_KEY?.trim() || undefined,
  publicDir: env.PUBLIC_DIR ?? "./public",
  version: env.npm_package_version ?? "0.1.0",
});

const port = Number(env.PORT ?? 8787);
const server = serve({ fetch: app.fetch, port, hostname: env.HOST ?? "0.0.0.0" }, (info) => {
  console.log(`✦ MyndShelf server em http://${info.address}:${info.port} · dados em ${dataDir}`);
});

const shutdown = () => {
  server.close();
  db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
