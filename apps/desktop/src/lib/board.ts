import type { BoardNodeKind } from "@myndshelf/types";
import { library } from "./store";

export const NODE_WIDTH: Record<BoardNodeKind, number> = { capture: 210, creation: 200, text: 220 };

const SLOT_W = 250;
const SLOT_H = 290;

/** Coloca um nó perto do centro visível do quadro, na primeira vaga livre de uma espiral. */
export function placeNode(projectId: string, kind: BoardNodeKind, refId?: string, text?: string) {
  const s = library.getState();
  const p = s.projects.find((x) => x.id === projectId);
  if (!p) return;
  const cx = (-p.viewport.x + 560) / p.viewport.zoom;
  const cy = (-p.viewport.y + 340) / p.viewport.zoom;
  const free = (x: number, y: number) =>
    p.nodes.every((o) => Math.abs(o.x + o.w / 2 - x) > SLOT_W * 0.9 || Math.abs(o.y + 120 - y) > SLOT_H * 0.9);
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
  return s.addNode(projectId, {
    kind,
    refId,
    text,
    w: NODE_WIDTH[kind],
    x: spot.x - NODE_WIDTH[kind] / 2,
    y: spot.y - 120,
  });
}
