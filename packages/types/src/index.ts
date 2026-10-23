/* ───────────────────────────── Captura ───────────────────────────── */

export type CaptureKind =
  | "music"
  | "podcast"
  | "book"
  | "video"
  | "film"
  | "game"
  | "product"
  | "article"
  | "image"
  | "code"
  | "place"
  | "note"
  | "link";

export interface OpenGraphData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  type?: string;
  url?: string;
  favicon?: string;
  author?: string;
  themeColor?: string;
  latitude?: number;
  longitude?: number;
}

export interface PlaceInfo {
  lat?: number;
  lng?: number;
  /** nível de zoom sugerido pelo link (Google: 15z, OSM: #map=15/…) */
  zoom?: number;
  name?: string;
  address?: string;
  /** texto buscado quando o link é uma pesquisa ("café perto de mim") */
  query?: string;
  /** Google Maps, Apple Maps, OpenStreetMap… */
  provider?: string;
  /** centro da tela do mapa — só orienta a busca, não é o lugar */
  near?: { lat: number; lng: number };
}

export interface ProductInfo {
  price?: number;
  /** código ISO: BRL, USD… */
  currency?: string;
  brand?: string;
  /** nome da loja */
  store?: string;
  available?: boolean;
}

export type CaptureStatus = "loading" | "ready" | "error";

export interface CaptureItem {
  id: string;
  kind: CaptureKind;
  url?: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
  author?: string;
  /** Texto livre — para notas é o conteúdo; para links, um comentário. */
  note?: string;
  /** Presente quando o item é um lugar no mapa. */
  place?: PlaceInfo;
  /** Presente quando o item é um produto de loja. */
  product?: ProductInfo;
  tags: string[];
  status: CaptureStatus;
  /** Matiz (0–360) usada para tingir capas sem imagem. */
  hue: number;
  createdAt: number;
}

/* ───────────────────────────── Feeds ─────────────────────────────── */

export interface Feed {
  id: string;
  /** URL do RSS/Atom */
  url: string;
  siteUrl?: string;
  title: string;
  description?: string;
  icon?: string;
  hue: number;
  lastFetched?: number;
  error?: string;
  createdAt: number;
}

export interface FeedEntry {
  /** feedId + guid — estável entre atualizações */
  id: string;
  feedId: string;
  title: string;
  url?: string;
  summary?: string;
  image?: string;
  author?: string;
  publishedAt: number;
  read: boolean;
  /** id da captura criada a partir desta entrada */
  savedAs?: string;
}

/* ───────────────────────────── Estante ───────────────────────────── */

export type CreationMedium = "image" | "document" | "audio" | "video" | "text" | "code" | "folder" | "object";

export interface Creation {
  id: string;
  title: string;
  medium: CreationMedium;
  fileName?: string;
  /** Caminho absoluto no disco (desktop). */
  filePath?: string;
  /** Pastas: o que tinha dentro quando foi arrastada. */
  folder?: { items: number; sample: string[] };
  /** Prévia leve (data URL) para renderizar sem acessar o disco. */
  preview?: string;
  mime?: string;
  size?: number;
  year?: number;
  notes?: string;
  shelfId: string | null;
  featured: boolean;
  hue: number;
  createdAt: number;
}

export interface Shelf {
  id: string;
  name: string;
  createdAt: number;
}

/* ───────────────────────────── Projetos ──────────────────────────── */

export type BoardNodeKind = "capture" | "creation" | "text";

export interface BoardNode {
  id: string;
  kind: BoardNodeKind;
  /** id do CaptureItem ou Creation quando kind ≠ text */
  refId?: string;
  text?: string;
  x: number;
  y: number;
  w: number;
  rotation: number;
}

export interface BoardEdge {
  id: string;
  from: string;
  to: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  nodes: BoardNode[];
  edges: BoardEdge[];
  viewport: Viewport;
  hue: number;
  createdAt: number;
  updatedAt: number;
}

/* ───────────────────────────── Library ───────────────────────────── */

export interface LibraryData {
  captures: CaptureItem[];
  feeds: Feed[];
  feedEntries: FeedEntry[];
  creations: Creation[];
  shelves: Shelf[];
  projects: Project[];
}
