import type { File } from "expo-file-system";
import {
  codeLines,
  countWords,
  csvSeparator,
  DOCX_STYLE_MAP,
  docLabel,
  escapeHtml,
  isBlankText,
  markdownTasks,
  parseCsv,
  parseSubtitles,
  prettyCode,
  readingMinutes,
  textToHtml,
  type DocKind,
} from "@myndshelf/core";
import { highlightBlocks, highlightCode } from "@myndshelf/core/highlight";
import type { Creation } from "@myndshelf/types";
import { colors } from "./theme";

const FONTS = "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Space+Mono&display=swap";

async function docxHtml(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const bytes = await file.bytes();
  const { value } = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer }, { styleMap: DOCX_STYLE_MAP });
  return value;
}

/** Texto do Word para a IA (o arquivo em si é um zip). */
export async function docxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const bytes = await file.bytes();
  const { value } = await mammoth.extractRawText({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });
  return value;
}

/** O que vai no corpo da página e o que aparece no cabeçalho. */
async function docBody(kind: Exclude<DocKind, "pdf" | "html">, file: File, fileName: string): Promise<{ html: string; meta?: string; wide?: boolean }> {
  const empty = { html: `<p class="empty">Este arquivo está vazio.</p>` };
  if (file.size === 0) return empty;
  if (kind === "docx") {
    const html = await docxHtml(file);
    return isBlankText(html.replace(/<[^>]+>/g, "")) ? empty : { html, meta: `${readingMinutes(countWords(html))} min de leitura` };
  }
  const text = await file.text();
  if (isBlankText(text)) return empty;
  if (kind === "markdown") {
    const { marked } = await import("marked");
    const html = await highlightBlocks(markdownTasks(await marked.parse(text.replace(/^\uFEFF/, ""), { gfm: true })));
    return { html, meta: `${readingMinutes(countWords(html))} min de leitura` };
  }
  if (kind === "csv") {
    const t = parseCsv(text, csvSeparator(text, fileName));
    const [head = [], ...rows] = t.rows;
    const cls = (j: number) => (t.numeric[j] ? ` class="num"` : "");
    const html =
      `<div class="table"><table><thead><tr>${head.map((h, j) => `<th${cls(j)}>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>` +
      rows.map((r) => `<tr>${head.map((_, j) => `<td${cls(j)}>${escapeHtml(r[j] ?? "")}</td>`).join("")}</tr>`).join("") +
      `</tbody></table></div>` +
      (t.hidden ? `<p class="more">+ ${t.hidden.toLocaleString("pt-BR")} linhas não mostradas</p>` : "");
    return { html, meta: `${rows.length + t.hidden} linhas · ${head.length} colunas`, wide: true };
  }
  if (kind === "subtitles") {
    const cues = parseSubtitles(text);
    if (cues.length) {
      const html = `<ol class="cues">${cues.map((c) => `<li><span class="t">${escapeHtml(c.start)}</span><p>${escapeHtml(c.text)}</p></li>`).join("")}</ol>`;
      return { html, meta: `${cues.length} falas · ${cues.at(-1)!.end}` };
    }
  }
  if (kind === "code") {
    const pretty = prettyCode(text, fileName);
    const html = `<pre class="code"><code>${codeLines(await highlightCode(pretty, fileName))}</code></pre>`;
    return { html, meta: `${pretty.split("\n").length - 1 || 1} linhas`, wide: true };
  }
  return { html: `<div class="plain">${textToHtml(text)}</div>`, meta: `${readingMinutes(countWords(text))} min de leitura` };
}

/** Página do leitor para Word, Markdown, tabela, legenda, código e texto. */
export async function documentHtml(item: Creation, kind: Exclude<DocKind, "pdf" | "html">, file: File, top: number): Promise<string> {
  const { html, meta, wide } = await docBody(kind, file, item.fileName ?? "");
  // se o documento abre com um <h1>, ele vira o título da página (sem repetir)
  const lead = html.trimStart().match(/^<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = lead ? lead[1].replace(/<(?!\/?(em|strong|i|b|u)>)[^>]+>/g, "").trim() : escapeHtml(item.title);
  const body = lead ? html.trimStart().slice(lead[0].length) : html;
  const kicker = [docLabel(kind, item.fileName), item.year, meta].filter(Boolean).join(" · ");
  return page(
    `<div class="kicker">${escapeHtml(kicker)}</div><h1 class="title">${title}</h1><hr class="rule">${body}<p class="end">✦</p>`,
    top,
    wide,
  );
}

function page(body: string, top: number, wide = false) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${FONTS}">
<style>
:root{color-scheme:dark}
html,body{margin:0;background:${colors.void};color:${colors.paper}}
body{font:18px/1.62 Newsreader,Georgia,serif;padding:${top + 14}px ${wide ? 14 : 22}px 120px;max-width:680px;margin:0 auto;-webkit-text-size-adjust:100%;overflow-wrap:break-word}
.kicker{font:10px/1.4 "Space Mono",monospace;letter-spacing:.16em;text-transform:uppercase;color:${colors.amber}}
h1.title{font:400 36px/1.02 "Instrument Serif",serif;letter-spacing:-.01em;margin:10px 0 14px}
.rule{border:0;border-top:1px solid ${colors.line};margin:0 0 24px}
h1,h2,h3,h4{font-family:"Instrument Serif",serif;font-weight:400;line-height:1.1}
h1{font-size:32px}h2{font-size:28px;margin:1.5em 0 .4em}h3{font-size:22px;font-style:italic}
a{color:${colors.cyan};text-decoration-color:rgba(111,214,255,.4)}
u{text-decoration-color:${colors.amber};text-underline-offset:3px}
img{max-width:100%;height:auto;border-radius:6px}
blockquote{margin:1.4em 0;padding-left:16px;border-left:2px solid ${colors.amber};font-style:italic;color:${colors.paperDim}}
blockquote p{margin:.3em 0}
ul,ol{padding-left:1.3em}li{margin-bottom:.35em}
li.task{list-style:none;margin-left:-1.3em}
.task-box{display:inline-block;width:1em;height:1em;margin-right:.35em;vertical-align:-.12em;border:1.5px solid ${colors.paperDim};border-radius:4px;font-size:.85em;line-height:1;text-align:center}
li.task[data-done="true"]{color:${colors.paperDim};text-decoration:line-through}
li.task[data-done="true"] .task-box{background:${colors.amber};border-color:${colors.amber};color:${colors.void}}
pre,code{font:12.5px/1.6 "Space Mono",monospace}
p code,li code{background:rgba(239,230,210,.08);border-radius:4px;padding:1px 4px}
pre{padding:12px 14px;overflow-x:auto;border-radius:8px;background:rgba(239,230,210,.05);border:1px solid ${colors.line}}
table{border-collapse:collapse;font-size:14px}td,th{border-bottom:1px solid ${colors.line};padding:7px 10px;text-align:left;vertical-align:top}
th{font:10px "Space Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:${colors.amber}}
.table{overflow-x:auto;border:1px solid ${colors.line};border-radius:8px}.table td,.table th{white-space:nowrap}
.num{text-align:right;font-variant-numeric:tabular-nums}
.more{font:11px "Space Mono",monospace;color:${colors.paperMute}}
hr{border:0;border-top:1px dashed ${colors.lineStrong};margin:2em 0}
.plain p{white-space:pre-wrap;margin:0 0 1em}
.empty{font:italic 22px "Instrument Serif",serif;color:${colors.paperDim};text-align:center;margin-top:40px}
.cues{list-style:none;margin:0;padding:0}.cues li{display:grid;grid-template-columns:6ch 1fr;gap:14px;padding:10px 0;border-bottom:1px dashed ${colors.line}}
.cues p{margin:0;white-space:pre-line}.cues .t{font:11px/2 "Space Mono",monospace;color:${colors.amber}}
pre.code{background:#0d0b07;border-color:rgba(255,180,61,.2);color:rgba(255,210,140,.9);padding:14px 12px}
pre.code code{counter-reset:line}.line{counter-increment:line}
.line::before{content:counter(line);display:inline-block;width:3ch;margin-right:1.6ch;text-align:right;color:rgba(255,210,140,.28)}
.hljs-comment,.hljs-quote{color:rgba(239,230,210,.42);font-style:italic}
.hljs-keyword,.hljs-selector-tag,.hljs-built_in{color:#ff8a5c}
.hljs-string,.hljs-regexp{color:#b9e07a}
.hljs-number,.hljs-literal,.hljs-symbol{color:#6fd6ff}
.hljs-title,.hljs-section{color:#ffd27a}
.hljs-attr,.hljs-attribute,.hljs-property,.hljs-variable,.hljs-template-variable{color:#f0b4ff}
.hljs-type,.hljs-tag,.hljs-name{color:#7fe0c4}.hljs-meta{color:#c9a46a}
.end{text-align:center;color:${colors.amber};margin-top:40px}
::selection{background:${colors.amber};color:${colors.void}}
</style></head><body>${body}</body></html>`;
}

/** PDF no Android: o WebView não mostra PDF sozinho, então desenhamos as páginas com o pdf.js. */
export function pdfHtml(base64: string, top: number) {
  const v = "3.11.174";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=4">
<style>html,body{margin:0;background:${colors.void}}body{padding:${top + 8}px 8px 80px}
canvas{display:block;width:100%;height:auto;margin:0 auto 10px;background:#fff;border-radius:2px;box-shadow:0 4px 18px rgba(0,0,0,.45)}
p{font:14px/1.5 Georgia,serif;color:${colors.paperDim};text-align:center;margin-top:40px}</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${v}/pdf.min.js"></script></head><body><p id="msg">abrindo o documento…</p>
<script>
(async () => {
  const msg = document.getElementById("msg");
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${v}/pdf.worker.min.js";
    const raw = atob("${base64}");
    const data = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data }).promise;
    msg.remove();
    const width = document.body.clientWidth - 16;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width / base.width) * (window.devicePixelRatio || 1) });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      document.body.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    }
  } catch (e) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage("pdf-error");
    msg.textContent = typeof pdfjsLib === "undefined" ? "Sem internet para abrir o PDF aqui." : "Não deu para abrir este PDF.";
  }
})();
</script></body></html>`;
}
