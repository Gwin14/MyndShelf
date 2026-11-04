#!/usr/bin/env node
/**
 * Monta a extensão do Finder (File Provider) e põe em src-tauri/target/drive/:
 *   MyndShelfDrive.appex      → copiada para MyndShelf.app/Contents/PlugIns (tauri.conf.json)
 *   MyndShelf.entitlements    → entitlements do app (App Group, para entregar o token à extensão)
 *
 * Usa os mesmos .swift da extensão do iOS (apps/mobile/targets/drive). Sem Xcode project:
 * compila com swiftc e assina com codesign.
 *
 * Variáveis:
 *   MYNDSHELF_APPLE_TEAM_ID     Team ID da Apple (obrigatório para o drive funcionar)
 *   APPLE_SIGNING_IDENTITY      "Developer ID Application: …" (a mesma que o Tauri usa)
 *
 * Fora do macOS não faz nada. Sem Team ID, gera uma extensão com assinatura ad-hoc:
 * o app abre normalmente, mas o macOS não carrega o drive.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") process.exit(0);

const here = dirname(fileURLToPath(import.meta.url));
const tauri = join(here, "..", "src-tauri");
const sources = join(here, "..", "..", "mobile", "targets", "drive");
const out = join(tauri, "target", "drive");
const appex = join(out, "MyndShelfDrive.appex");

const conf = JSON.parse(readFileSync(join(tauri, "tauri.conf.json"), "utf8"));
const hostId = conf.identifier;
const version = conf.version;
const team = process.env.MYNDSHELF_APPLE_TEAM_ID?.trim() ?? "";
const identity = process.env.APPLE_SIGNING_IDENTITY?.trim() || "-";
const group = `${team || "NOTEAM"}.${hostId}`;

if (!team) console.warn("⚠ MYNDSHELF_APPLE_TEAM_ID não definido: a extensão do Finder vai junto, mas o macOS não vai carregá-la.");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(appex, "Contents", "MacOS"), { recursive: true });

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
const sdk = execFileSync("xcrun", ["--show-sdk-path", "--sdk", "macosx"], { encoding: "utf8" }).trim();
const swift = readdirSync(sources).filter((f) => f.endsWith(".swift")).map((f) => join(sources, f));

// uma fatia por arquitetura, depois junta (o app pode ser universal)
const slices = [];
for (const arch of ["arm64", "x86_64"]) {
  const bin = join(out, `MyndShelfDrive-${arch}`);
  sh("xcrun", [
    "swiftc",
    "-target", `${arch}-apple-macos12.0`,
    "-sdk", sdk,
    "-swift-version", "5",
    "-O",
    "-module-name", "MyndShelfDrive",
    "-parse-as-library",
    "-application-extension",
    "-framework", "FileProvider",
    "-framework", "UniformTypeIdentifiers",
    // extensões começam pelo NSExtensionMain do sistema, não por um main próprio
    "-Xlinker", "-e", "-Xlinker", "_NSExtensionMain",
    "-o", bin,
    ...swift,
  ]);
  slices.push(bin);
}
sh("lipo", ["-create", ...slices, "-output", join(appex, "Contents", "MacOS", "MyndShelfDrive")]);
for (const s of slices) rmSync(s);

const plist = (o) => {
  const v = (x) =>
    typeof x === "boolean" ? `<${x}/>` : typeof x === "string" ? `<string>${x}</string>` : Array.isArray(x)
      ? `<array>${x.map(v).join("")}</array>`
      : `<dict>${Object.entries(x).map(([k, y]) => `<key>${k}</key>${v(y)}`).join("")}</dict>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${v(o)}</plist>\n`;
};

writeFileSync(
  join(appex, "Contents", "Info.plist"),
  plist({
    CFBundleDevelopmentRegion: "pt-BR",
    CFBundleDisplayName: "MyndShelf",
    CFBundleExecutable: "MyndShelfDrive",
    CFBundleIdentifier: `${hostId}.drive`,
    CFBundleInfoDictionaryVersion: "6.0",
    CFBundleName: "MyndShelfDrive",
    CFBundlePackageType: "XPC!",
    CFBundleShortVersionString: version,
    CFBundleVersion: version,
    LSMinimumSystemVersion: "12.0",
    MyndShelfAppGroup: group,
    NSExtension: {
      NSExtensionPointIdentifier: "com.apple.fileprovider-nonui",
      NSExtensionPrincipalClass: "MyndShelfDrive.FileProviderExtension",
      NSExtensionFileProviderDocumentGroup: group,
      NSExtensionFileProviderSupportsEnumeration: true,
    },
  }),
);

const appexEntitlements = join(out, "MyndShelfDrive.entitlements");
writeFileSync(
  appexEntitlements,
  plist({
    "com.apple.security.app-sandbox": true,
    "com.apple.security.network.client": true,
    "com.apple.security.application-groups": [group],
  }),
);
// o app em si: mesmo grupo, para escrever drive.json na pasta compartilhada
writeFileSync(join(out, "MyndShelf.entitlements"), plist({ "com.apple.security.application-groups": [group] }));

const sign = ["--force", "--sign", identity, "--entitlements", appexEntitlements];
if (identity !== "-") sign.push("--options", "runtime", "--timestamp");
sh("codesign", [...sign, appex]);
console.log(`✦ extensão do Finder pronta: ${appex} (grupo ${group})`);
