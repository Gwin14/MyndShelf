import DOMPurify from "dompurify";
import type { Creation } from "@myndshelf/types";
import { codeLanguageOf, isCodeFile } from "@myndshelf/core";

/** Formatos que o app sabe abrir por dentro. */
export type DocKind = "pdf" | "docx" | "markdown" | "text" | "code" | "csv" | "html";


export function docKindOf(c: Pick<Creation, "fileName" | "mime">): DocKind | undefined {
  const ext = c.fileName?.split(".").pop()?.toLowerCase() ?? "";
  const mime = c.mime ?? "";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (/^(md|markdown|mdx)$/.test(ext)) return "markdown";
  if (/^(csv|tsv)$/.test(ext)) return "csv";
  if (/^(html?|xhtml)$/.test(ext)) return "html";
  if (isCodeFile(c.fileName)) return "code";
  if (/^(txt|text|log|nfo|srt|vtt)$/.test(ext) || mime.startsWith("text/")) return "text";
  return undefined;
}

/** Nome para mostrar: a linguagem, no caso de código ("Abrir Python"). */
export function docLabel(kind: DocKind, fileName?: string): string {
  return kind === "code" ? codeLanguageOf(fileName).name : DOC_LABELS[kind];
}

export const DOC_LABELS: Record<DocKind, string> = {
  pdf: "PDF",
  docx: "Word",
  markdown: "Markdown",
  text: "Texto",
  code: "Código",
  csv: "Tabela",
  html: "HTML",
};

/* ───────────────────────── PDF (pdf.js) ───────────────────────── */

type PdfJs = typeof import("pdfjs-dist");
let pdfjs: Promise<PdfJs> | undefined;

/** pdf.js só carrega quando um PDF é aberto. */
export function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjs;
}

export async function openPdf(blob: Blob) {
  const lib = await loadPdfJs();
  return lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
}

/** Primeira página do PDF como capa (data URL leve). */
export async function pdfCover(blob: Blob, width = 520): Promise<string | undefined> {
  try {
    const doc = await openPdf(blob);
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const url = canvas.toDataURL("image/jpeg", 0.82);
    void doc.loadingTask.destroy();
    return url;
  } catch {
    return undefined;
  }
}

/* ───────────────────────── texto e afins ───────────────────────── */

export type DocContent =
  | { type: "html"; html: string; words: number }
  | { type: "code"; text: string; lang: string }
  | { type: "table"; rows: string[][] };

const sanitize = (html: string) =>
  DOMPurify.sanitize(html, { FORBID_TAGS: ["style", "script", "iframe", "form", "input", "button"], FORBID_ATTR: ["style"] });

const countWords = (html: string) => html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;

function parseCsv(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
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
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.slice(0, 2000);
}

/** Converte o arquivo em algo que o leitor sabe mostrar. */
export async function loadDocContent(kind: Exclude<DocKind, "pdf">, blob: Blob, fileName = ""): Promise<DocContent> {
  if (kind === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
    const html = sanitize(value);
    return { type: "html", html, words: countWords(html) };
  }

  const text = await blob.text();
  if (kind === "markdown") {
    const { marked } = await import("marked");
    const html = sanitize(await marked.parse(text, { gfm: true }));
    return { type: "html", html, words: countWords(html) };
  }
  if (kind === "html") {
    const body = new DOMParser().parseFromString(text, "text/html").body.innerHTML;
    const html = sanitize(body);
    return { type: "html", html, words: countWords(html) };
  }
  if (kind === "csv") {
    const sep = fileName.toLowerCase().endsWith(".tsv") ? "\t" : (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
    return { type: "table", rows: parseCsv(text, sep) };
  }
  if (kind === "code") return { type: "code", text, lang: fileName.split(".").pop() ?? "" };

  // texto puro: parágrafos separados por linha em branco
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return { type: "html", html, words: countWords(html) };
}
