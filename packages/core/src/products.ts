import type { ProductInfo } from "@myndshelf/types";
import { decodeEntities } from "./opengraph";

/**
 * Produtos de lojas. Muitas lojas grandes bloqueiam leitores de link, então há
 * duas camadas: (1) dados estruturados da página (JSON-LD Product, OpenGraph de
 * produto) quando a loja entrega; (2) reconhecer a loja e o nome pelo próprio link.
 */

interface StoreRule {
  host: RegExp;
  label: string;
  /** caminho de página de produto (não de busca/categoria) */
  path: RegExp;
  /** de onde tirar o nome do produto no link */
  slug?: (parts: string[], u: URL) => string | undefined;
}

const before = (marker: string) => (p: string[]) => p[p.indexOf(marker) - 1];
const after = (marker: string, n = 1) => (p: string[]) => p[p.indexOf(marker) + n];

const STORES: StoreRule[] = [
  { host: /(^|\.)amazon\.[a-z.]+$/, label: "Amazon", path: /\/(dp|gp\/product)\/[A-Z0-9]{10}/i, slug: (p) => (p[0] !== "dp" && p[0] !== "gp" ? p[0] : undefined) },
  { host: /(^|\.)mercadoli(vre|bre)\.[a-z.]+$/, label: "Mercado Livre", path: /\/p\/ML[A-Z]\d+|\/ML[A-Z]-?\d+/i, slug: (p) => (p.includes("p") ? before("p")(p) : p[0]?.replace(/^ML[A-Z]-\d+-/i, "").replace(/-_J[MP].*$/i, "")) },
  { host: /(^|\.)magazineluiza\.com\.br$|(^|\.)magalu\.com$/, label: "Magalu", path: /\/p\/[a-z0-9]+/i, slug: before("p") },
  { host: /(^|\.)(americanas|submarino|shoptime)\.com\.br$/, label: "Americanas", path: /\/produto\/\d+/, slug: after("produto", 2) },
  { host: /(^|\.)(casasbahia|pontofrio|extra)\.com\.br$/, label: "Casas Bahia", path: /\/p\/\d+|\.html$/, slug: (p) => p[0]?.replace(/\.html$/, "") },
  { host: /(^|\.)kabum\.com\.br$/, label: "KaBuM!", path: /^\/produto\/\d+/, slug: after("produto", 2) },
  { host: /(^|\.)shopee\.[a-z.]+$/, label: "Shopee", path: /-i\.\d+\.\d+/, slug: (p) => p[0]?.replace(/-i\.\d+\.\d+.*$/, "") },
  { host: /(^|\.)aliexpress\.[a-z.]+$/, label: "AliExpress", path: /\/item\/\d+/ },
  { host: /(^|\.)shein\.[a-z.]+$/, label: "Shein", path: /-p-\d+/, slug: (p) => p.at(-1)?.replace(/-p-\d+.*$/, "") },
  { host: /(^|\.)temu\.com$/, label: "Temu", path: /-g-\d+\.html/, slug: (p) => p.at(-1)?.replace(/-g-\d+\.html$/, "") },
  { host: /(^|\.)(netshoes|centauro)\.com\.br$/, label: "Loja esportiva", path: /\/(produto|p)\/|-[A-Z0-9]{3,}-\d+/, slug: (p) => p.at(-1) },
  { host: /(^|\.)nike\.com(\.br)?$/, label: "Nike", path: /\/t\/|-\d+\.html$/, slug: (p) => (p[0] === "t" ? p[1] : p.at(-1)?.replace(/-\d+\.html$/, "")) },
  { host: /(^|\.)adidas\.[a-z.]+$/, label: "adidas", path: /\/[A-Z0-9]{6}\.html$/, slug: (p) => p.at(-2) },
  { host: /(^|\.)zara\.com$/, label: "Zara", path: /-p\d+\.html$/, slug: (p) => p.at(-1)?.replace(/-p\d+\.html$/, "") },
  { host: /(^|\.)etsy\.com$/, label: "Etsy", path: /\/listing\/\d+/, slug: after("listing", 2) },
  { host: /(^|\.)ebay\.[a-z.]+$/, label: "eBay", path: /\/itm\//, slug: (p) => (/^\d+$/.test(p[1] ?? "") ? undefined : p[1]) },
  { host: /(^|\.)walmart\.com$/, label: "Walmart", path: /\/ip\//, slug: after("ip") },
  { host: /(^|\.)target\.com$/, label: "Target", path: /\/p\//, slug: after("p") },
  { host: /(^|\.)bestbuy\.com$/, label: "Best Buy", path: /\/site\/.+\.p$/, slug: after("site") },
  { host: /(^|\.)ikea\.com$/, label: "IKEA", path: /\/p\//, slug: (p) => after("p")(p)?.replace(/-[s]?\d{6,}$/, "") },
  { host: /(^|\.)apple\.com$/, label: "Apple", path: /\/shop\/(buy-|product\/)/, slug: (p) => p.at(-1)?.replace(/^buy-/, "") },
  { host: /(^|\.)leroymerlin\.com\.br$/, label: "Leroy Merlin", path: /_\d+$/, slug: (p) => p.at(-1)?.replace(/_\d+$/, "") },
  { host: /(^|\.)tokstok\.com\.br$/, label: "Tok&Stok", path: /\/p$/, slug: before("p") },
];

/** Lojas com páginas de produto em caminhos padrão (Shopify, WooCommerce, VTEX…). */
const GENERIC_PRODUCT_PATH = /\/(products?|produtos?)\/[^/]+/i;

export interface ProductStore {
  label?: string;
  /** nome deduzido do link (slug) */
  name?: string;
}

function slugToName(slug?: string): string | undefined {
  if (!slug) return;
  const words = decodeURIComponent(slug)
    .replace(/\.(html?|aspx?|php)$/i, "")
    .split(/[-_+]+/)
    .filter((w) => w && !/^\d{5,}$/.test(w) && !/^ML[A-Z]\d+$/i.test(w));
  const name = words.join(" ").trim();
  return name.length > 2 ? name.charAt(0).toUpperCase() + name.slice(1) : undefined;
}

/** A URL é de uma página de produto conhecida? Devolve a loja e o nome deduzido. */
export function productStoreOf(url: string): ProductStore | undefined {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const parts = u.pathname.split("/").filter(Boolean);
    const rule = STORES.find((s) => s.host.test(host));
    if (rule) return rule.path.test(u.pathname) ? { label: rule.label, name: slugToName(rule.slug?.(parts, u)) } : undefined;
    if (GENERIC_PRODUCT_PATH.test(u.pathname)) {
      const i = parts.findIndex((p) => /^(products?|produtos?)$/i.test(p));
      return { name: slugToName(parts[i + 1]) };
    }
  } catch {
    /* URL inválida */
  }
  return undefined;
}

/* ───────────────────────── dados estruturados ───────────────────────── */

export interface ProductData extends ProductInfo {
  name?: string;
  image?: string;
  description?: string;
}

const num = (v: unknown): number | undefined => {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return;
  const s = v.replace(/[^\d.,]/g, "");
  // "1.059,98" (pt-BR) ou "1,059.98" (en)
  const n = /,\d{1,2}$/.test(s) ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function findProduct(node: unknown): Record<string, unknown> | undefined {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findProduct(n);
      if (hit) return hit;
    }
    return;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  if (type === "Product" || type === "ProductGroup" || (Array.isArray(type) && type.includes("Product"))) return obj;
  return findProduct(obj["@graph"]) ?? findProduct(obj["mainEntity"]);
}

const first = <T>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);

/** Lê JSON-LD (schema.org/Product) e metas de preço do OpenGraph. */
export function productFromHtml(html: string): ProductData | undefined {
  let data: ProductData = {};

  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const p = findProduct(JSON.parse(m[1].trim()));
      if (!p) continue;
      const offers: Record<string, unknown> = first(p.offers as Record<string, unknown> | Record<string, unknown>[] | undefined) ?? {};
      type Obj = Record<string, unknown>;
      const variant = first<Obj>(p.hasVariant as Obj[] | undefined);
      const vOffers: Obj = (variant ? first<Obj>(variant.offers as Obj | Obj[] | undefined) : undefined) ?? {};
      const brand = first(p.brand as unknown);
      const image = first(p.image as unknown);
      data = {
        name: typeof p.name === "string" ? decodeEntities(p.name) : undefined,
        description: typeof p.description === "string" ? decodeEntities(p.description).slice(0, 400) : undefined,
        image: typeof image === "string" ? image : (image as { url?: string } | undefined)?.url,
        brand: typeof brand === "string" ? brand : (brand as { name?: string } | undefined)?.name,
        price: num(offers.price ?? offers.lowPrice ?? vOffers.price),
        currency: (offers.priceCurrency ?? vOffers.priceCurrency) as string | undefined,
        available: typeof offers.availability === "string" ? !/OutOfStock|Discontinued|SoldOut/i.test(offers.availability) : undefined,
      };
      break;
    } catch {
      /* JSON-LD malformado: segue */
    }
  }

  const meta = (name: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${name}["']`, "i"))?.[1];

  data.price ??= num(meta("product:price:amount") ?? meta("og:price:amount") ?? meta("price"));
  data.currency ??= meta("product:price:currency") ?? meta("og:price:currency") ?? meta("priceCurrency");
  data.brand ??= meta("product:brand") ?? meta("og:brand");

  const isProduct = data.name || data.price != null || /og:type["'][^>]+content=["']product/i.test(html);
  return isProduct ? data : undefined;
}

/** "R$ 1.059,98" — formatado no padrão brasileiro. */
export function formatPrice(price?: number, currency = "BRL"): string | undefined {
  if (price == null) return;
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL", maximumFractionDigits: price % 1 ? 2 : 0 }).format(price);
  } catch {
    return `${currency} ${price}`;
  }
}
