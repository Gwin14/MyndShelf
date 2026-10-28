import type { Creation } from "@myndshelf/types";
import { codeLanguageOf, isCodeFile } from "./media";

/** Formatos que o app sabe abrir por dentro, no desktop e no celular. */
export type DocKind = "pdf" | "docx" | "markdown" | "text" | "subtitles" | "code" | "csv" | "html";

export function docKindOf(c: Pick<Creation, "fileName" | "mime">): DocKind | undefined {
  const ext = c.fileName?.split(".").pop()?.toLowerCase() ?? "";
  const mime = c.mime ?? "";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (/^(md|markdown|mdx)$/.test(ext)) return "markdown";
  if (/^(csv|tsv)$/.test(ext)) return "csv";
  if (/^(srt|vtt)$/.test(ext)) return "subtitles";
  if (/^(html?|xhtml)$/.test(ext)) return "html";
  if (isCodeFile(c.fileName)) return "code";
  if (/^(txt|text|log|nfo)$/.test(ext) || mime.startsWith("text/")) return "text";
  return undefined;
}

export const DOC_LABELS: Record<DocKind, string> = {
  pdf: "PDF",
  docx: "Word",
  markdown: "Markdown",
  text: "Texto",
  subtitles: "Legenda",
  code: "Código",
  csv: "Tabela",
  html: "HTML",
};

/** Nome para mostrar: a linguagem, no caso de código ("Abrir Python"). */
export function docLabel(kind: DocKind, fileName?: string): string {
  return kind === "code" ? codeLanguageOf(fileName).name : DOC_LABELS[kind];
}

/** Estilos do Word que o mammoth não reconhece sozinho (título, citação, sublinhado). */
export const DOCX_STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => p.subtitle:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "u => u",
];

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Arquivo sem nada além de espaços e quebras de linha. */
export const isBlankText = (text: string) => !text.replace(/^\uFEFF/, "").trim();

export const countWords = (html: string) => html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;

export const readingMinutes = (words: number) => Math.max(1, Math.round(words / 220));

/** Texto puro: parágrafos separados por linha em branco; o resto (recuos, quebras) fica como está. */
export function textToHtml(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p class="plain">${escapeHtml(p)}</p>`)
    .join("");
}

/** Caixinhas das listas de tarefas do Markdown viram símbolos (o sanitizador remove `<input>`). */
export function markdownTasks(html: string): string {
  return html.replace(/<li>\s*<input([^>]*)type="checkbox"([^>]*)>\s*/g, (_, a: string, b: string) => {
    const done = /checked/.test(a + b);
    return `<li class="task" data-done="${done}"><span class="task-box" aria-label="${done ? "feito" : "a fazer"}">${done ? "✓" : ""}</span> `;
  });
}

/* ───────────────────────── tabelas (CSV/TSV) ───────────────────────── */

export const TABLE_ROW_LIMIT = 2000;

/** Vírgula, ponto e vírgula (Excel em português) ou tab — o que aparecer mais na primeira linha. */
export function csvSeparator(text: string, fileName = ""): string {
  if (fileName.toLowerCase().endsWith(".tsv")) return "\t";
  const head = text.split("\n")[0];
  const count = (ch: string) => head.split(ch).length - 1;
  return [",", ";", "\t"].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ",");
}

export interface Table {
  rows: string[][];
  /** linhas que ficaram de fora por passar do limite */
  hidden: number;
  /** colunas que são números em todas as linhas (alinhadas à direita) */
  numeric: boolean[];
}

export function parseCsv(text: string, sep = csvSeparator(text)): Table {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let total = 0;
  const pushRow = () => {
    total++;
    if (rows.length <= TABLE_ROW_LIMIT) rows.push(row);
    row = [];
  };
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      pushRow();
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    pushRow();
  }
  // linhas totalmente vazias (ex.: fim do arquivo) não contam
  const kept = rows.filter((r) => r.some((c) => c.trim()));
  const width = Math.max(0, ...kept.map((r) => r.length));
  const body = kept.slice(1);
  const isNum = (s: string) => /^-?[\d.,]+%?$/.test(s.trim()) && /\d/.test(s);
  const numeric = Array.from({ length: width }, (_, j) => body.length > 0 && body.every((r) => !r[j]?.trim() || isNum(r[j])));
  return { rows: kept, hidden: Math.max(0, total - 1 - TABLE_ROW_LIMIT), numeric };
}

/* ───────────────────────── legendas (SRT/VTT) ───────────────────────── */

export interface Cue {
  start: string;
  end: string;
  text: string;
}

/** Blocos "00:00:01,000 --> 00:00:03,500" seguidos do texto; tags de estilo saem. */
export function parseSubtitles(text: string): Cue[] {
  // 00:01:02,500 → 01:02; 1:02:03 fica com a hora
  const time = (t: string) => {
    const parts = t.trim().replace(/[.,]\d+$/, "").split(":");
    return (parts.length === 3 && parts[0] === "00" ? parts.slice(1) : parts).join(":");
  };
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .flatMap((block) => {
      const lines = block.split("\n");
      const at = lines.findIndex((l) => l.includes("-->"));
      if (at < 0) return [];
      const [start, end] = lines[at].split("-->");
      const body = lines
        .slice(at + 1)
        .join("\n")
        .replace(/<[^>]+>/g, "")
        .trim();
      return body ? [{ start: time(start), end: time(end.split(/\s/).filter(Boolean)[0] ?? ""), text: body }] : [];
    });
}

/* ───────────────────────── código ───────────────────────── */

/** JSON numa linha só fica legível com recuo; o resto continua como veio. */
export function prettyCode(text: string, fileName = ""): string {
  if (/\.json$/i.test(fileName)) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2) + "\n";
    } catch {
      /* JSON inválido: mostra como está */
    }
  }
  return text;
}

/** Uma `<span class="line">` por linha, para a numeração em CSS. */
export function codeLines(html: string): string {
  // tags abertas no fim de uma linha (comentários longos) reabrem na seguinte
  const open: string[] = [];
  return html
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => {
      const prefix = open.join("");
      for (const m of line.matchAll(/<span[^>]*>|<\/span>/g)) {
        if (m[0] === "</span>") open.pop();
        else open.push(m[0]);
      }
      return `<span class="line">${prefix}${line}${"</span>".repeat(open.length)}</span>`;
    })
    .join("\n");
}
