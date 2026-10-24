import type { BoardNodeKind, CaptureItem, Project } from "@myndshelf/types";

/** Altura aproximada de cada capa (em larguras de coluna), para equilibrar as colunas do mural. */
export function coverHeight(item: CaptureItem): number {
  if (item.status === "loading") return 0.8;
  const caption = 0.32;
  switch (item.kind) {
    case "music":
      return 0.86 + caption;
    case "podcast":
      return 1 + caption;
    case "book":
      return 1.2 + caption;
    case "video":
      return 0.92 + caption;
    case "product":
      return 1 + caption;
    case "game":
      return 1.18 + caption;
    case "film":
      return 0.82 + caption;
    case "image":
      return 1.15 + caption;
    case "place":
      return 0.92 + caption;
    case "article":
      return (item.image ? 1.25 : 0.75) + Math.min(0.4, (item.title.length / 60) * 0.2);
    case "code":
      return 0.75 + Math.min(0.5, ((item.description?.length ?? 0) / 140) * 0.3);
    case "note":
      return 0.75 + Math.min(0.6, ((item.note ?? item.title).length / 200) * 0.3);
    default:
      return 0.63 + caption;
  }
}

/** Distribui itens em colunas, sempre na mais baixa — ordem de leitura preservada. */
export function balanceColumns<T>(items: T[], columns: number, height: (item: T) => number): T[][] {
  const cols: T[][] = Array.from({ length: columns }, () => []);
  const heights = new Array<number>(columns).fill(0);
  for (const item of items) {
    let min = 0;
    for (let i = 1; i < columns; i++) if (heights[i] < heights[min] - 0.05) min = i;
    cols[min].push(item);
    heights[min] += height(item) + 0.12;
  }
  return cols;
}

export const NODE_WIDTH: Record<BoardNodeKind, number> = { capture: 210, creation: 200, text: 220 };

const SLOT_W = 250;
const SLOT_H = 290;

/**
 * Primeira vaga livre de uma espiral em torno de um ponto do quadro (coordenadas do mundo).
 * Devolve o canto superior esquerdo do nó.
 */
export function freeSpot(project: Project, kind: BoardNodeKind, center: { x: number; y: number }) {
  const { x: cx, y: cy } = center;
  const free = (x: number, y: number) =>
    project.nodes.every((o) => Math.abs(o.x + o.w / 2 - x) > SLOT_W * 0.9 || Math.abs(o.y + 120 - y) > SLOT_H * 0.9);
  let spot = { x: cx, y: cy };
  for (let i = 0; i < 200; i++) {
    const a = i * 2.4;
    const r = Math.sqrt(i) * 150;
    const c = { x: cx + Math.cos(a) * r * 1.3, y: cy + Math.sin(a) * r };
    if (free(c.x, c.y)) {
      spot = c;
      break;
    }
  }
  return { x: spot.x - NODE_WIDTH[kind] / 2, y: spot.y - 120 };
}
