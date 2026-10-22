import type { CreationMedium } from "@myndshelf/types";

export interface CodeLanguage {
  name: string;
  /** cor do disquete — a "leve distinção" de cada linguagem */
  color: string;
}

/** Linguagens agrupadas por família; a cor segue a identidade visual de cada uma. */
const LANGS: [RegExp, CodeLanguage][] = [
  [/^(js|jsx|mjs|cjs)$/, { name: "JavaScript", color: "#e8c547" }],
  [/^(ts|tsx|mts|cts)$/, { name: "TypeScript", color: "#3b74c4" }],
  [/^(py|pyw|ipynb)$/, { name: "Python", color: "#3f6fa0" }],
  [/^rs$/, { name: "Rust", color: "#c8643a" }],
  [/^go$/, { name: "Go", color: "#39a7c6" }],
  [/^swift$/, { name: "Swift", color: "#e8573a" }],
  [/^(kt|kts)$/, { name: "Kotlin", color: "#8a5be0" }],
  [/^java$/, { name: "Java", color: "#b0722e" }],
  [/^(c|h)$/, { name: "C", color: "#6b7b93" }],
  [/^(cpp|cc|cxx|hpp|hh)$/, { name: "C++", color: "#4f6fae" }],
  [/^cs$/, { name: "C#", color: "#5f4fa8" }],
  [/^rb$/, { name: "Ruby", color: "#b8323a" }],
  [/^php$/, { name: "PHP", color: "#7178b0" }],
  [/^(html?|xhtml)$/, { name: "HTML", color: "#d9643b" }],
  [/^(css|scss|sass|less)$/, { name: "CSS", color: "#7c4fb8" }],
  [/^(vue|svelte|astro)$/, { name: "Componente", color: "#3fa77a" }],
  [/^(json|jsonc|json5)$/, { name: "JSON", color: "#8a8a7a" }],
  [/^(ya?ml|toml|ini|env|cfg|conf)$/, { name: "Config", color: "#9a8f6a" }],
  [/^(xml|plist)$/, { name: "XML", color: "#8f7a5a" }],
  [/^sql$/, { name: "SQL", color: "#c58a2e" }],
  [/^(sh|bash|zsh|fish|ps1|bat)$/, { name: "Shell", color: "#4d8a4a" }],
  [/^lua$/, { name: "Lua", color: "#2f3f9a" }],
  [/^dart$/, { name: "Dart", color: "#2f9bc4" }],
  [/^(r|jl)$/, { name: "Dados", color: "#3d78a8" }],
  [/^(ex|exs|erl|hs|elm|clj|scala|ml|fs)$/, { name: "Funcional", color: "#8e4f8e" }],
  [/^(glsl|frag|vert|wgsl|hlsl|shader)$/, { name: "Shader", color: "#c2407a" }],
];

const CODE_EXT = /^(js|jsx|mjs|cjs|ts|tsx|mts|cts|py|pyw|ipynb|rs|go|swift|kts?|java|c|h|cpp|cc|cxx|hpp|hh|cs|rb|php|html?|xhtml|css|scss|sass|less|vue|svelte|astro|json|jsonc|json5|ya?ml|toml|ini|env|cfg|conf|xml|plist|sql|sh|bash|zsh|fish|ps1|bat|lua|dart|r|jl|ex|exs|erl|hs|elm|clj|scala|ml|fs|glsl|frag|vert|wgsl|hlsl|shader)$/;

const extOf = (name = "") => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

export function isCodeFile(name = ""): boolean {
  return CODE_EXT.test(extOf(name));
}

/** Linguagem do arquivo de código (ou um "Código" neutro). */
export function codeLanguageOf(name = ""): CodeLanguage & { ext: string } {
  const ext = extOf(name);
  const lang = LANGS.find(([re]) => re.test(ext))?.[1] ?? { name: "Código", color: "#7a7468" };
  return { ...lang, ext };
}

export function mediumFromFile(name: string, mime = ""): CreationMedium {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime.startsWith("image/") || /^(png|jpe?g|gif|webp|avif|heic|tiff?|bmp|svg|psd)$/.test(ext)) return "image";
  if (mime.startsWith("audio/") || /^(mp3|wav|flac|aiff?|ogg|m4a|opus)$/.test(ext)) return "audio";
  if (mime.startsWith("video/") || /^(mp4|mov|webm|mkv|avi|m4v)$/.test(ext)) return "video";
  if (isCodeFile(name)) return "code";
  if (/^(pdf|epub|docx?|pages|key|pptx?)$/.test(ext)) return "document";
  if (mime.startsWith("text/") || /^(txt|md|rtf|json|html?)$/.test(ext)) return "text";
  return "object";
}

export const MEDIUM_LABELS: Record<CreationMedium, string> = {
  image: "Imagem",
  document: "Documento",
  audio: "Áudio",
  video: "Vídeo",
  text: "Texto",
  code: "Código",
  object: "Objeto",
};

export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}
