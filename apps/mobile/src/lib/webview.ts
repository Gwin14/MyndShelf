import { colors } from "./theme";

const FONTS = "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&family=Space+Mono&display=swap";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Página do leitor: a mesma tipografia editorial do desktop (Newsreader + Instrument Serif). */
export function readerHtml(a: { title: string; byline?: string; siteName?: string; minutes: number; html: string }, top = 0) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${FONTS}">
<style>
:root{color-scheme:dark}
html,body{margin:0;background:${colors.void};color:${colors.paper}}
body{font:19px/1.62 Newsreader,Georgia,serif;padding:${top + 18}px 22px 120px;max-width:680px;margin:0 auto;-webkit-text-size-adjust:100%;word-wrap:break-word}
.kicker{font:10px/1.4 "Space Mono",monospace;letter-spacing:.16em;text-transform:uppercase;color:${colors.paperMute}}
h1.title{font:400 38px/1.02 "Instrument Serif",serif;letter-spacing:-.01em;margin:10px 0 14px}
.by{font:10px/1.4 "Space Mono",monospace;letter-spacing:.1em;text-transform:uppercase;color:${colors.amber};margin-bottom:28px;padding-bottom:18px;border-bottom:1px solid ${colors.line}}
h1,h2,h3,h4{font-family:"Instrument Serif",serif;font-weight:400;line-height:1.1}
h2{font-size:30px;margin:1.6em 0 .4em}h3{font-size:24px}
a{color:${colors.cyan};text-decoration-color:rgba(111,214,255,.4)}
img,video,figure{max-width:100%;height:auto;border-radius:6px}
figure{margin:1.4em 0}figcaption{font:12px/1.4 "Space Mono",monospace;color:${colors.paperMute};margin-top:6px}
blockquote{margin:1.4em 0;padding-left:18px;border-left:2px solid ${colors.amber};font-style:italic;color:${colors.paperDim}}
pre,code{font:13px/1.5 "Space Mono",monospace;background:rgba(239,230,210,.06);border-radius:6px}
pre{padding:12px;overflow-x:auto}code{padding:1px 4px}
table{border-collapse:collapse;display:block;overflow-x:auto;font-size:15px}td,th{border:1px solid ${colors.line};padding:6px 8px}
hr{border:0;border-top:1px dashed ${colors.lineStrong};margin:2em 0}
::selection{background:${colors.amber};color:${colors.void}}
</style></head><body>
<div class="kicker">${esc(a.siteName ?? "")}</div>
<h1 class="title">${esc(a.title)}</h1>
<div class="by">${a.byline ? `${esc(a.byline)} · ` : ""}${a.minutes} min de leitura</div>
${a.html}
</body></html>`;
}

/** Player incorporado dentro de uma página nossa — o YouTube exige uma origem para tocar. */
export function embedHtml(src: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style></head>
<body><iframe src="${src.replace(/"/g, "&quot;")}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
}

export const EMBED_ORIGIN = "https://myndshelf.app";
