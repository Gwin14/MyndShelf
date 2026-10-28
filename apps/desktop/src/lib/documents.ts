import DOMPurify from "dompurify";
import {
  codeLines,
  countWords,
  csvSeparator,
  DOCX_STYLE_MAP,
  isBlankText,
  markdownTasks,
  parseCsv,
  parseSubtitles,
  prettyCode,
  textToHtml,
  type Cue,
  type DocKind,
  type Table,
} from "@myndshelf/core";
import { highlightBlocks, highlightCode } from "@myndshelf/core/highlight";

export { docKindOf, docLabel, DOC_LABELS, type DocKind } from "@myndshelf/core";

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

/** Texto corrido das primeiras páginas; vazio quando o PDF é só imagem (escaneado). */
export async function pdfText(blob: Blob, maxPages = 40): Promise<string> {
  const doc = await openPdf(blob);
  try {
    const pages: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
    }
    return pages.join("\n\n").replace(/[ \t]+/g, " ").trim();
  } finally {
    void doc.loadingTask.destroy();
  }
}

/* ───────────────────────── texto e afins ───────────────────────── */

export type DocContent =
  | { type: "html"; html: string; words: number }
  | { type: "code"; text: string; html: string; lang: string }
  | { type: "table"; table: Table }
  | { type: "subtitles"; cues: Cue[] }
  | { type: "empty" };

const sanitize = (html: string) =>
  DOMPurify.sanitize(html, { FORBID_TAGS: ["style", "script", "iframe", "form", "input", "button"], FORBID_ATTR: ["style"] });

const asHtml = (raw: string): DocContent => {
  const html = sanitize(raw);
  return { type: "html", html, words: countWords(html) };
};

/** Converte o arquivo em algo que o leitor sabe mostrar. */
export async function loadDocContent(kind: Exclude<DocKind, "pdf">, blob: Blob, fileName = ""): Promise<DocContent> {
  if (blob.size === 0) return { type: "empty" };
  if (kind === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() }, { styleMap: DOCX_STYLE_MAP });
    return isBlankText(value.replace(/<[^>]+>/g, "")) ? { type: "empty" } : asHtml(value);
  }

  const text = await blob.text();
  if (isBlankText(text)) return { type: "empty" };
  if (kind === "markdown") {
    const { marked } = await import("marked");
    return asHtml(await highlightBlocks(markdownTasks(await marked.parse(text.replace(/^\uFEFF/, ""), { gfm: true }))));
  }
  if (kind === "html") return asHtml(new DOMParser().parseFromString(text, "text/html").body.innerHTML);
  if (kind === "csv") return { type: "table", table: parseCsv(text, csvSeparator(text, fileName)) };
  if (kind === "subtitles") {
    const cues = parseSubtitles(text);
    if (cues.length) return { type: "subtitles", cues };
  }
  if (kind === "code") {
    const pretty = prettyCode(text, fileName);
    return { type: "code", text: pretty, html: codeLines(await highlightCode(pretty, fileName)), lang: fileName.split(".").pop() ?? "" };
  }
  return asHtml(textToHtml(text));
}
