import { escapeHtml } from "./documents";

// fora do index: os tipos do highlight.js trazem o DOM junto, e o servidor não quer isso
type Hljs = typeof import("highlight.js").default;
let hljs: Promise<Hljs> | undefined;

/** Código colorido como HTML (classes `hljs-*`); só carrega o highlight.js quando é preciso. */
export async function highlightCode(text: string, fileName = ""): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  try {
    hljs ??= import("highlight.js/lib/common").then((m) => m.default);
    const lib = await hljs;
    if (text.length > 200_000) return escapeHtml(text);
    const lang = lib.getLanguage(ext) ? ext : undefined;
    return lang ? lib.highlight(text, { language: lang }).value : lib.highlightAuto(text).value;
  } catch {
    return escapeHtml(text);
  }
}

/** Blocos de código do Markdown/HTML (`<pre><code class="language-js">`) ganham cor. */
export async function highlightBlocks(html: string): Promise<string> {
  const blocks = [...html.matchAll(/<pre><code(?: class="language-([\w+-]+)")?>([\s\S]*?)<\/code><\/pre>/g)];
  if (!blocks.length) return html;
  const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const colored = await Promise.all(blocks.map(([, lang, code]) => highlightCode(unescape(code), lang ? `x.${lang}` : "")));
  let i = 0;
  return html.replace(/<pre><code(?: class="language-([\w+-]+)")?>([\s\S]*?)<\/code><\/pre>/g, () => `<pre><code class="hljs">${colored[i++]}</code></pre>`);
}
