/**
 * Jogos: lojas como Epic, PlayStation, Xbox e Nintendo não entregam metadados
 * para bots (são apps em JavaScript). Então lemos o nome do jogo no próprio
 * link e completamos pela Steam (capa vertical, estúdio) ou pela Wikipédia
 * (capa da caixa, ano) — as duas sem chave de API.
 */

import type { TextFetcher } from "./feedResolve";

export interface GameStore {
  /** Nome da loja/site, mostrado no card */
  label: string;
  steamId?: string;
  /** Nome do jogo deduzido do link (slug) */
  name?: string;
}

export interface GameDetails {
  title?: string;
  image?: string;
  developer?: string;
  description?: string;
  year?: string;
}

const slugToName = (slug?: string) =>
  slug
    ? decodeURIComponent(slug)
        .replace(/--\d+$/, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b(switch( 2)?|ps[45]|xbox( series x\|s| one)?|pc|edition|digital)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim() || undefined
    : undefined;

const STORES: { host: RegExp; label: string; read: (u: URL, parts: string[]) => Partial<GameStore> | undefined }[] = [
  {
    host: /^(store\.steampowered\.com|steamcommunity\.com|s\.team)$/,
    label: "Steam",
    read: (_u, p) => {
      const i = p.findIndex((x) => x === "app" || x === "a");
      return i >= 0 && /^\d+$/.test(p[i + 1] ?? "") ? { steamId: p[i + 1], name: slugToName(p[i + 2]) } : undefined;
    },
  },
  { host: /(^|\.)epicgames\.com$/, label: "Epic Games", read: (_u, p) => ({ name: slugToName(p[p.indexOf("p") + 1]) }) },
  { host: /(^|\.)gog\.com$/, label: "GOG", read: (_u, p) => ({ name: slugToName(p[p.indexOf("game") + 1]) }) },
  {
    host: /(^|\.)nintendo\.[a-z.]+$/,
    label: "Nintendo eShop",
    read: (_u, p) => ({ name: slugToName(p[p.indexOf("products") + 1] ?? p[p.indexOf("detail") + 1]) }),
  },
  { host: /(^|\.)playstation\.com$/, label: "PlayStation Store", read: (_u, p) => ({ name: p.includes("games") ? slugToName(p[p.indexOf("games") + 1]) : undefined }) },
  { host: /(^|\.)xbox\.com$/, label: "Xbox", read: (_u, p) => ({ name: slugToName(p[p.indexOf("store") + 1]) }) },
  { host: /(^|\.)humblebundle\.com$/, label: "Humble", read: (_u, p) => ({ name: slugToName(p[p.indexOf("store") + 1]) }) },
  { host: /(^|\.)itch\.io$/, label: "itch.io", read: (_u, p) => ({ name: slugToName(p[0]) }) },
  { host: /(^|\.)backloggd\.com$/, label: "Backloggd", read: (_u, p) => ({ name: slugToName(p[p.indexOf("games") + 1]) }) },
  { host: /(^|\.)igdb\.com$/, label: "IGDB", read: (_u, p) => ({ name: slugToName(p[p.indexOf("games") + 1]) }) },
  { host: /(^|\.)metacritic\.com$/, label: "Metacritic", read: (_u, p) => ({ name: slugToName(p[p.indexOf("game") + 1]) }) },
  { host: /(^|\.)rawg\.io$/, label: "RAWG", read: (_u, p) => ({ name: slugToName(p[p.indexOf("games") + 1]) }) },
  { host: /(^|\.)gamejolt\.com$/, label: "Game Jolt", read: (_u, p) => ({ name: slugToName(p[p.indexOf("games") + 1]) }) },
  { host: /(^|\.)howlongtobeat\.com$/, label: "HowLongToBeat", read: () => ({}) },
  { host: /(^|\.)roblox\.com$/, label: "Roblox", read: (_u, p) => ({ name: slugToName(p[2]) }) },
];

/** Loja de jogos reconhecida pelo link (ou undefined). */
export function gameStoreOf(url: string): GameStore | undefined {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const parts = u.pathname.split("/").filter(Boolean);
    const store = STORES.find((s) => s.host.test(host));
    if (!store) return;
    return { label: store.label, ...store.read(u, parts) };
  } catch {
    return;
  }
}

/** Tira o "no Steam", "Reviews - Metacritic", "How long is …?" dos títulos. */
export function cleanGameTitle(title?: string): string | undefined {
  return title
    ?.replace(/[™®©]/g, "")
    .replace(/^(Save \d+% on|Economize \d+% em)\s+/i, "")
    .replace(/^(Comprar|Buy|Compre)( o| a| os| as)?\s+/i, "")
    .replace(/\s+from the Humble Store$/i, "")
    .replace(/\s+for Nintendo Switch( 2)?.*$/i, "")
    .replace(/\s*[|–—-]\s*(XBOX|Nintendo Official Site|PlayStation.*)$/i, "")
    .replace(/\s*[—–-]?\s*\d+% off$/i, "")
    .replace(/\s*[—–-]\s*Remastered$/i, "")
    .replace(/\s+(no|on|en|auf) Steam$/i, "")
    .replace(/^How long is (.+)\?.*$/i, "$1")
    .replace(/\s+Reviews?\s*-\s*Metacritic$/i, "")
    .replace(/\s*\|\s*(GOG\.COM|HowLongToBeat|Backloggd|itch\.io|Epic Games Store)$/i, "")
    .replace(/\s+\((19|20)\d{2}\)$/, "")
    .trim();
}

const STEAM_ASSETS = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";

export async function steamDetails(id: string, get: TextFetcher): Promise<GameDetails> {
  const json = JSON.parse(await get(`https://store.steampowered.com/api/appdetails?appids=${id}&l=brazilian&cc=br`));
  const d = json?.[id]?.data;
  if (!d) return { image: `${STEAM_ASSETS}/${id}/library_600x900_2x.jpg` };
  return {
    title: d.name,
    // capa vertical da biblioteca — o mesmo formato de caixa de jogo
    image: `${STEAM_ASSETS}/${id}/library_600x900_2x.jpg`,
    developer: d.developers?.[0],
    description: d.short_description ? d.short_description.replace(/<[^>]+>/g, "") : undefined,
    year: d.release_date?.date?.match(/\d{4}/)?.[0],
  };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");

export const sameGame = (a?: string, b?: string) => !!a && !!b && norm(a) === norm(b);

/** Procura o jogo pelo nome: primeiro na Steam (nome exato), depois na Wikipédia. */
export async function lookupGame(name: string, get: TextFetcher): Promise<GameDetails | undefined> {
  try {
    const search = JSON.parse(
      await get(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&cc=br&l=brazilian`),
    ) as { items?: { id: number; name: string }[] };
    const hit = search.items?.find((i) => norm(i.name) === norm(name));
    if (hit) return await steamDetails(String(hit.id), get);
  } catch {
    /* Steam fora do ar — tenta a Wikipédia */
  }

  try {
    const s = JSON.parse(
      await get(
        `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=1&prop=description&gsrsearch=${encodeURIComponent(`${name} video game`)}`,
      ),
    ) as { query?: { pages?: Record<string, { title: string; description?: string }> } };
    const page = Object.values(s.query?.pages ?? {})[0];
    if (!page || !/game/i.test(page.description ?? "")) return;
    // a busca da Wikipédia é aproximada: "Celeste Classic" não pode virar "Celeste"
    const found = norm(page.title.replace(/\s*\(.*\)$/, ""));
    const wanted = norm(name);
    if (!found.includes(wanted) && !(wanted.includes(found) && found.length / wanted.length >= 0.8)) return;
    const sum = JSON.parse(
      await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.title.replace(/ /g, "_"))}`),
    ) as { title?: string; originalimage?: { source: string }; extract?: string; description?: string };
    return {
      title: sum.title?.replace(/\s*\((\d{4} )?video game\)$/i, ""),
      image: sum.originalimage?.source?.replace(/\?.*$/, ""),
      description: sum.extract,
      year: sum.description?.match(/\d{4}/)?.[0],
    };
  } catch {
    return;
  }
}
