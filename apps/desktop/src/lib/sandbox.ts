/**
 * Páginas HTML da Estante rodam com CSS e JavaScript, mas presas numa caixa:
 *
 * 1. <iframe sandbox="allow-scripts"> SEM allow-same-origin → a página ganha uma
 *    origem opaca: não enxerga o app, o IndexedDB, os cookies nem o Tauri.
 * 2. Content-Security-Policy injetada no <head> → por padrão nada sai para a rede
 *    (nem fetch, nem scripts/CSS/imagens externos, nem envio de formulários).
 * 3. Links externos não navegam: viram um pedido que a pessoa confirma no app.
 *
 * Arquivos irmãos (style.css, app.js, imagens) que também estejam na Estante
 * são embutidos no documento, então um projeto de várias páginas ainda funciona.
 */

export type AssetResolver = (path: string) => Promise<Blob | undefined>;

export const SANDBOX_FLAGS = "allow-scripts";

/** Mensagem que o script de guarda manda ao app quando um link externo é clicado. */
export const OPEN_LINK_MESSAGE = "myndshelf:open-link";

function csp(allowNetwork: boolean): string {
  const net = allowNetwork ? " https:" : "";
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' data: blob:${net}`,
    `style-src 'unsafe-inline' data:${net}`,
    `img-src data: blob:${net}`,
    `font-src data:${net}`,
    `media-src data: blob:${net}`,
    `connect-src${allowNetwork ? " https:" : " 'none'"}`,
    "form-action 'none'",
    "frame-src 'none'",
    "worker-src blob: data:",
  ].join("; ");
}

/** Intercepta cliques em links: âncoras internas funcionam, externos pedem permissão ao app. */
const GUARD = `(() => {
  document.addEventListener("click", (e) => {
    const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (href.startsWith("#") || href.startsWith("javascript:")) return;
    e.preventDefault();
    if (/^https?:/i.test(a.href)) parent.postMessage({ type: "${OPEN_LINK_MESSAGE}", url: a.href }, "*");
  }, true);
  window.open = () => null;
})();`;

const isLocalPath = (p: string | null) => !!p && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(p.trim());

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export interface SandboxDoc {
  html: string;
  /** arquivos citados pela página que não estão na Estante */
  missing: string[];
  /** arquivos encontrados na Estante e embutidos */
  embedded: string[];
}

export async function buildSandboxDoc(source: string, opts: { allowNetwork: boolean; resolve: AssetResolver }): Promise<SandboxDoc> {
  // DOMParser não executa scripts — é seguro manipular aqui
  const doc = new DOMParser().parseFromString(source, "text/html");
  const missing: string[] = [];
  const embedded: string[] = [];

  const fetchAsset = async (path: string) => {
    const blob = await opts.resolve(path.split(/[?#]/)[0]);
    (blob ? embedded : missing).push(path);
    return blob;
  };

  for (const link of Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]'))) {
    const href = link.getAttribute("href");
    if (!isLocalPath(href)) continue;
    const blob = await fetchAsset(href!);
    if (!blob) continue;
    const style = doc.createElement("style");
    style.textContent = await blob.text();
    link.replaceWith(style);
  }

  for (const script of Array.from(doc.querySelectorAll<HTMLScriptElement>("script[src]"))) {
    const src = script.getAttribute("src");
    if (!isLocalPath(src)) continue;
    const blob = await fetchAsset(src!);
    if (!blob) continue;
    script.removeAttribute("src");
    script.textContent = await blob.text();
  }

  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("img[src], source[src], video[src], audio[src], video[poster]"))) {
    for (const attr of ["src", "poster"]) {
      const v = el.getAttribute(attr);
      if (!isLocalPath(v)) continue;
      const blob = await fetchAsset(v!);
      if (blob) el.setAttribute(attr, await blobToDataUrl(blob));
    }
  }

  // a política de segurança precisa ser o primeiro elemento do <head>
  const meta = doc.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content = csp(opts.allowNetwork);
  const guard = doc.createElement("script");
  guard.textContent = GUARD;
  doc.head.prepend(meta, guard);

  return { html: `<!doctype html>\n${doc.documentElement.outerHTML}`, missing: [...new Set(missing)], embedded: [...new Set(embedded)] };
}
