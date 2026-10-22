import type { CaptureKind } from "@myndshelf/types";
import { decodeEntities } from "./opengraph";

/** Dados que o OpenGraph não traz (ou traz errado) para sites específicos. */
export interface SiteDetails {
  kind?: CaptureKind;
  title?: string;
  image?: string;
  author?: string;
}

const text = (html?: string) =>
  html ? decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() || undefined : undefined;

/**
 * Amazon: não manda og:image para bots (manda o logo), mas a página vem completa.
 * Lemos a capa em alta, o título do produto, o autor e se é um livro.
 */
function amazon(url: URL, html: string): SiteDetails {
  const isbnPath = /\/(dp|gp\/product)\/\d{9}[\dX](\/|$|\?)/i.test(url.pathname);
  const bookMarkers = /rpi-attribute-book_details|bookDescription_feature_div|id="booksTitle"|id="ebooksImgBlkFront"|id="imgBlkFront"/.test(html);

  const imgTag = html.match(/<img[^>]+id="(?:landingImage|imgBlkFront|ebooksImgBlkFront)"[^>]*>/)?.[0];
  const hires = imgTag?.match(/data-old-hires="([^"]+)"/)?.[1];
  const dynamic = imgTag?.match(/data-a-dynamic-image="\{&quot;([^&]+)&quot;/)?.[1];
  const src = imgTag?.match(/\ssrc="(https:[^"]+)"/)?.[1];
  // remove o sufixo de tamanho (._SY342_) para pegar a maior versão
  const image = (hires || dynamic || src)?.replace(/\._[^/]+_\.(jpg|png)$/i, ".$1");

  const author = text(html.match(/class="author[^"]*"[\s\S]{0,1500}?<a[^>]*>([\s\S]*?)<\/a>/)?.[1]);
  const title = text(html.match(/id="productTitle"[^>]*>([\s\S]*?)<\/span>/)?.[1]);

  return { kind: isbnPath || bookMarkers ? "book" : undefined, title, image, author };
}

const SITES: { host: RegExp; extract: (url: URL, html: string) => SiteDetails }[] = [
  { host: /(^|\.)amazon\.[a-z.]+$/, extract: amazon },
];

export function siteDetails(pageUrl: string, html: string): SiteDetails {
  try {
    const url = new URL(pageUrl);
    const site = SITES.find((s) => s.host.test(url.hostname));
    return site ? site.extract(url, html) : {};
  } catch {
    return {};
  }
}

/**
 * Corrige imagens de capa conhecidas:
 * Apple Music manda a arte num retângulo 1200×630 com faixas brancas — pedimos a versão quadrada.
 * A Amazon manda o próprio logo como og:image — descartamos.
 */
export function improveImage(image?: string): string | undefined {
  if (!image) return image;
  if (/mzstatic\.com\/image\/thumb\//.test(image)) return image.replace(/\/[^/]+$/, "/1000x1000bb.jpg");
  if (/media-amazon\.com\/images\/G\/.*(share-icons|previewdoh)/.test(image)) return undefined;
  return image;
}
