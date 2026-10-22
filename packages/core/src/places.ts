import type { PlaceInfo } from "@myndshelf/types";

/* ───────────────────────── coordenadas ───────────────────────── */

const valid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

function pair(a?: string | null, b?: string | null): { lat: number; lng: number } | undefined {
  if (a == null || b == null) return;
  const lat = parseFloat(a);
  const lng = parseFloat(b);
  return valid(lat, lng) ? { lat, lng } : undefined;
}

/** "lat,lng" num texto qualquer (aceita "lat, lng", "lat%2Clng", "lat~lng"). */
function latLng(s?: string | null): { lat: number; lng: number } | undefined {
  const m = s && decodeURIComponent(s).match(/(-?\d{1,2}(?:\.\d+)?)\s*[,~;]\s*(-?\d{1,3}(?:\.\d+)?)/);
  return m ? pair(m[1], m[2]) : undefined;
}

function dms(deg: string, min = "0", sec = "0", hemi = ""): number {
  const v = parseFloat(deg) + parseFloat(min) / 60 + parseFloat(sec) / 3600;
  return /[SWO]/i.test(hemi) ? -v : v;
}

/**
 * Coordenadas coladas como texto: "-23.5614, -46.6559", "geo:-23.56,-46.65"
 * ou graus/minutos/segundos: 23°33'41"S 46°39'21"W.
 */
export function parseCoordinates(text: string): { lat: number; lng: number } | undefined {
  const s = text.trim();
  if (s.length > 80) return;
  const geo = s.match(/^geo:(-?[\d.]+),(-?[\d.]+)/i);
  if (geo) return pair(geo[1], geo[2]);
  const dec = s.match(/^\(?\s*(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*\)?$/);
  if (dec) return pair(dec[1], dec[2]);
  const d = s.match(
    /(\d{1,2})[°º]\s*(?:(\d{1,2})['′]\s*)?(?:([\d.]+)["″]\s*)?([NS])[\s,]+(\d{1,3})[°º]\s*(?:(\d{1,2})['′]\s*)?(?:([\d.]+)["″]\s*)?([EWLO])/i,
  );
  if (d) {
    const lat = dms(d[1], d[2], d[3], d[4]);
    const lng = dms(d[5], d[6], d[7], d[8]);
    return valid(lat, lng) ? { lat, lng } : undefined;
  }
}

/** 23°33′41″S 46°39′21″W */
export function formatCoords(lat: number, lng: number): string {
  const f = (v: number, pos: string, neg: string) => {
    const a = Math.abs(v);
    const deg = Math.floor(a);
    const min = Math.floor((a - deg) * 60);
    const sec = Math.round(((a - deg) * 60 - min) * 60);
    return `${deg}°${String(min).padStart(2, "0")}′${String(sec).padStart(2, "0")}″${v >= 0 ? pos : neg}`;
  };
  return `${f(lat, "N", "S")} ${f(lng, "E", "W")}`;
}

/** Geohash (usado nos links curtos do Waze: waze.com/ul/h6gyf…) */
function decodeGeohash(hash: string): { lat: number; lng: number } | undefined {
  const base = "0123456789bcdefghjkmnpqrstuvwxyz";
  let even = true;
  const lat = [-90, 90];
  const lng = [-180, 180];
  for (const c of hash.toLowerCase()) {
    const v = base.indexOf(c);
    if (v < 0) return;
    for (let bit = 4; bit >= 0; bit--) {
      const range = even ? lng : lat;
      const mid = (range[0] + range[1]) / 2;
      if ((v >> bit) & 1) range[0] = mid;
      else range[1] = mid;
      even = !even;
    }
  }
  return { lat: (lat[0] + lat[1]) / 2, lng: (lng[0] + lng[1]) / 2 };
}

/* ───────────────────────── links de mapas ───────────────────────── */

/** Links curtos que só revelam o lugar depois do redirecionamento. */
const SHORTENERS = /^(maps\.app\.goo\.gl|goo\.gl|g\.page|g\.co|maps\.apple|share\.google)$/;

const MAP_HOSTS =
  /(^|\.)(google\.[a-z.]+|maps\.apple\.com|maps\.apple|openstreetmap\.org|osm\.org|waze\.com|bing\.com|here\.com|yandex\.[a-z.]+|2gis\.[a-z.]+|mapcarta\.com|wikimapia\.org|what3words\.com|w3w\.co)$/;

function hostOfUrl(url: URL) {
  return url.hostname.replace(/^www\./, "");
}

export function isShortMapUrl(input: string): boolean {
  try {
    const u = new URL(input);
    const host = hostOfUrl(u);
    return SHORTENERS.test(host) && (host !== "goo.gl" || u.pathname.startsWith("/maps"));
  } catch {
    return false;
  }
}

/** O link é de um serviço de mapas (ou um encurtador deles)? */
export function isMapUrl(input: string): boolean {
  if (/^geo:/i.test(input.trim())) return true;
  try {
    const u = new URL(input);
    const host = hostOfUrl(u);
    if (isShortMapUrl(input)) return true;
    if (!MAP_HOSTS.test(host)) return false;
    if (/google\./.test(host)) return u.pathname.startsWith("/maps") || host.startsWith("maps.");
    if (host === "bing.com") return u.pathname.startsWith("/maps");
    if (/yandex\./.test(host)) return u.pathname.includes("/maps");
    return true;
  } catch {
    return false;
  }
}

const words = (s?: string | null) => (s ? decodeURIComponent(s.replace(/\+/g, " ")).trim() || undefined : undefined);

/**
 * Lê o lugar de um link de mapa, sem rede: Google Maps (lugar, pesquisa,
 * rota, coordenadas), Apple Maps, OpenStreetMap, Waze, Bing, HERE, Yandex e geo:.
 */
export function parsePlaceUrl(input: string): PlaceInfo | undefined {
  const raw = input.trim();
  if (/^geo:/i.test(raw)) {
    const c = parseCoordinates(raw);
    const q = raw.match(/[?&]q=([^&]+)/)?.[1];
    const label = words(q?.replace(/^-?[\d.]+,-?[\d.]+\s*/, "").replace(/^\(|\)$/g, ""));
    return { ...c, name: label, query: c ? undefined : label, provider: "Coordenadas" };
  }

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return;
  }
  const host = hostOfUrl(u);
  const q = u.searchParams;
  const path = decodeURIComponent(u.pathname);

  // ── Google Maps ──
  if (/google\./.test(host)) {
    const info: PlaceInfo = { provider: "Google Maps" };
    // o pino exato vem em data=…!3d<lat>!4d<lng>; o @ é só o centro da tela
    const pin = u.href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    const view = path.match(/@(-?\d+\.\d+),(-?\d+\.\d+)(?:,(\d+(?:\.\d+)?)z)?/);
    const exact = pin ? pair(pin[1], pin[2]) : undefined;
    const center = view ? pair(view[1], view[2]) : undefined;
    if (view?.[3]) info.zoom = Math.round(parseFloat(view[3]));

    const place = path.match(/\/maps\/place\/([^/@]+)/)?.[1];
    const search = path.match(/\/maps\/search\/([^/@]+)/)?.[1];
    const dir = path.match(/\/maps\/dir\/(.+?)(?:\/@|$)/)?.[1];
    const query = q.get("q") ?? q.get("query") ?? q.get("destination") ?? q.get("daddr");

    if (place) info.name = words(place);
    else if (dir) info.query = words(dir.split("/").filter(Boolean).at(-1));
    else if (search) info.query = words(search);

    const qCoords = latLng(query) ?? latLng(q.get("ll")) ?? latLng(q.get("center"));
    if (query && !qCoords) info.query ??= words(query);

    const c = exact ?? qCoords ?? (place ? center : undefined) ?? center;
    if (c) Object.assign(info, c);
    if (info.query && !place && !exact && !qCoords) {
      // numa pesquisa ou rota, o centro da tela só orienta a busca do lugar
      if (center) info.near = center;
      delete info.lat;
      delete info.lng;
    }
    return info;
  }

  // ── Apple Maps ──
  if (host === "maps.apple.com") {
    const c = latLng(q.get("coordinate")) ?? latLng(q.get("ll")) ?? latLng(q.get("sll")) ?? latLng(q.get("daddr"));
    const name = words(q.get("name")) ?? words(q.get("q"));
    const address = words(q.get("address"));
    const query = c ? undefined : words(q.get("daddr")) ?? name ?? address;
    const z = q.get("z");
    return { ...c, name, address, query, zoom: z ? parseInt(z, 10) : undefined, provider: "Apple Maps" };
  }

  // ── OpenStreetMap ──
  if (host === "openstreetmap.org" || host === "osm.org") {
    const hash = u.hash.match(/map=(\d+)\/(-?[\d.]+)\/(-?[\d.]+)/);
    const marker = pair(q.get("mlat"), q.get("mlon"));
    const c = marker ?? (hash ? pair(hash[2], hash[3]) : undefined);
    const obj = path.match(/^\/(node|way|relation)\/(\d+)/);
    return {
      ...c,
      zoom: hash ? parseInt(hash[1], 10) : undefined,
      query: obj ? `${obj[1][0].toUpperCase()}${obj[2]}` : words(q.get("query")),
      provider: "OpenStreetMap",
    };
  }

  // ── Waze ──
  if (host === "waze.com") {
    const gh = path.match(/^\/ul\/h([0-9a-z]+)/i)?.[1];
    const c = (gh ? decodeGeohash(gh) : undefined) ?? latLng(q.get("ll")) ?? latLng(q.get("to")?.replace(/^ll\./, "")) ?? latLng(q.get("latlng"));
    return { ...c, query: c ? undefined : words(q.get("q")), name: c ? words(q.get("q")) : undefined, provider: "Waze" };
  }

  // ── Bing, HERE, Yandex ──
  if (host === "bing.com") {
    const c = latLng(q.get("cp"));
    const where = words(q.get("where1")) ?? words(q.get("q"));
    const lvl = q.get("lvl");
    return { ...c, name: c ? where : undefined, query: c ? undefined : where, zoom: lvl ? Math.round(+lvl) : undefined, provider: "Bing Maps" };
  }
  if (host.endsWith("here.com")) {
    const m = q.get("map")?.split(",");
    const c = m ? pair(m[0], m[1]) : undefined;
    return { ...c, zoom: m?.[2] ? Math.round(+m[2]) : undefined, provider: "HERE" };
  }
  if (/yandex\./.test(host)) {
    // Yandex usa lng,lat
    const pt = (q.get("whatshere[point]") ?? q.get("pt") ?? q.get("ll"))?.split(",");
    const c = pt ? pair(pt[1], pt[0]) : undefined;
    const text = words(q.get("text"));
    return { ...c, name: c ? text : undefined, query: c ? undefined : text, zoom: q.get("z") ? +q.get("z")! : undefined, provider: "Yandex Maps" };
  }

  return { provider: host };
}

/* ───────────────────────── geocoding (Nominatim / OSM) ───────────────────────── */

export type TextGetter = (url: string) => Promise<string>;

const NOMINATIM = "https://nominatim.openstreetmap.org";

interface NominatimHit {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  addresstype?: string;
}

function shortAddress(display?: string, name?: string): string | undefined {
  if (!display) return;
  const parts = display.split(",").map((s) => s.trim());
  if (name && parts[0] === name) parts.shift();
  // tira CEP e país do fim para caber num card
  return parts.filter((p) => !/^\d{5}-?\d{3}$|^\d{4,6}$/.test(p)).slice(0, 4).join(", ") || undefined;
}

/**
 * Completa o que faltar: sem coordenadas → busca o endereço/nome;
 * sem nome → descobre o que existe naquele ponto.
 */
export async function resolvePlace(info: PlaceInfo, get: TextGetter): Promise<PlaceInfo> {
  const { near, ...out } = info;
  try {
    const osmId = out.query?.match(/^([NWR])(\d+)$/);
    if (osmId) {
      delete out.query;
      if (osmId[1] === "N") {
        // nós do OSM: a API devolve coordenada e nome direto
        const el = (JSON.parse(await get(`https://www.openstreetmap.org/api/0.6/node/${osmId[2]}.json`)) as {
          elements?: { lat: number; lon: number; tags?: Record<string, string> }[];
        }).elements?.[0];
        if (el) Object.assign(out, { lat: el.lat, lng: el.lon, name: out.name ?? el.tags?.name });
      } else {
        out.query = osmId[0];
      }
    }
    if (out.lat == null && (out.query || out.name || out.address)) {
      const term = out.query ?? out.name ?? out.address!;
      const isOsm = /^[WR]\d+$/.test(term);
      // perto de onde o mapa estava aberto, se o link disser
      const bias = near
        ? `&viewbox=${near.lng - 0.4},${near.lat + 0.4},${near.lng + 0.4},${near.lat - 0.4}`
        : "";
      const url = isOsm
        ? `${NOMINATIM}/lookup?format=jsonv2&osm_ids=${term}`
        : `${NOMINATIM}/search?format=jsonv2&limit=1&q=${encodeURIComponent(term)}${bias}`;
      const hit = (JSON.parse(await get(url)) as NominatimHit[])[0];
      if (hit) {
        out.lat = parseFloat(hit.lat);
        out.lng = parseFloat(hit.lon);
        out.name ??= hit.name || (isOsm ? undefined : out.query);
        out.address ??= shortAddress(hit.display_name, hit.name);
      }
    } else if (out.lat != null && out.lng != null && (!out.name || !out.address)) {
      const hit = JSON.parse(
        await get(`${NOMINATIM}/reverse?format=jsonv2&zoom=18&lat=${out.lat}&lon=${out.lng}`),
      ) as NominatimHit;
      if (hit?.display_name) {
        out.name ??= hit.name || undefined;
        out.address ??= shortAddress(hit.display_name, hit.name);
      }
    }
  } catch {
    /* sem geocoding: ficamos com o que o link trouxe */
  }
  return out;
}

/** Título legível para o card. */
export function placeTitle(p: PlaceInfo): string {
  return p.name ?? p.query ?? p.address?.split(",")[0] ?? (p.lat != null ? formatCoords(p.lat, p.lng!) : "Lugar");
}

/** Abrir o mesmo lugar em outros apps de mapa. */
export function mapLinks(p: PlaceInfo): { label: string; url: string }[] {
  if (p.lat == null || p.lng == null) {
    const q = encodeURIComponent(p.query ?? p.name ?? p.address ?? "");
    return [{ label: "Google Maps", url: `https://www.google.com/maps/search/?api=1&query=${q}` }];
  }
  const ll = `${p.lat},${p.lng}`;
  const label = encodeURIComponent(p.name ?? "");
  return [
    { label: "Google Maps", url: `https://www.google.com/maps/search/?api=1&query=${p.name ? `${label}&center=${ll}` : ll}` },
    { label: "Apple Maps", url: `https://maps.apple.com/?ll=${ll}${p.name ? `&q=${label}` : ""}` },
    { label: "Waze", url: `https://waze.com/ul?ll=${ll}&navigate=yes` },
    { label: "OpenStreetMap", url: `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}` },
  ];
}

/* ───────────────────────── tiles ───────────────────────── */

/** Posição em pixels (mundo de 256·2^z) de uma coordenada — para montar mapas com tiles. */
export function worldPixel(lat: number, lng: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}
