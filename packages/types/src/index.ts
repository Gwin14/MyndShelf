/* ───────────────────────────── Captura ───────────────────────────── */

export type CaptureKind =
  | "music"
  | "podcast"
  | "book"
  | "video"
  | "film"
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
  tags: string[];
  status: CaptureStatus;
  /** Matiz (0–360) usada para tingir capas sem imagem. */
  hue: number;
  createdAt: number;
}

/* ───────────────────────────── Estante ───────────────────────────── */

export type CreationMedium = "image" | "document" | "audio" | "video" | "text" | "object";

export interface Creation {
  id: string;
  title: string;
  medium: CreationMedium;
  fileName?: string;
  /** Caminho absoluto no disco (desktop). */
  filePath?: string;
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
  creations: Creation[];
  shelves: Shelf[];
  projects: Project[];
}
