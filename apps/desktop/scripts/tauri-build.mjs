#!/usr/bin/env node
/**
 * `tauri build` com o provisioning profile do app, quando há um.
 *
 * O profile entra como Contents/embedded.provisionprofile (bundle.macOS.files). Fica fora do
 * tauri.conf.json porque o caminho é de cada máquina e o build sem profile tem de continuar
 * funcionando. Variáveis em scripts/build-drive-appex.mjs. Argumentos extras vão para o tauri.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const args = ["build", ...process.argv.slice(2)];
const profile = process.env.MYNDSHELF_APP_PROFILE?.trim();
if (process.platform === "darwin" && profile) {
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), profile);
  if (!existsSync(path)) {
    console.error(`MYNDSHELF_APP_PROFILE não existe: ${path}`);
    process.exit(1);
  }
  process.env.MYNDSHELF_APP_PROFILE = path;
  args.push("--config", JSON.stringify({ bundle: { macOS: { files: { "embedded.provisionprofile": path } } } }));
}
const drive = process.env.MYNDSHELF_DRIVE_PROFILE?.trim();
if (drive) process.env.MYNDSHELF_DRIVE_PROFILE = resolve(process.env.INIT_CWD ?? process.cwd(), drive);

const env = { ...process.env, PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}` };
const r = spawnSync("tauri", args, { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
