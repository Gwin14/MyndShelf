import { freeSpot, NODE_WIDTH } from "@myndshelf/core";
import type { BoardNodeKind } from "@myndshelf/types";
import { library } from "./store";

export { NODE_WIDTH };

/** Coloca um nó perto do centro visível do quadro, na primeira vaga livre de uma espiral. */
export function placeNode(projectId: string, kind: BoardNodeKind, refId?: string, text?: string) {
  const s = library.getState();
  const p = s.projects.find((x) => x.id === projectId);
  if (!p) return;
  const center = { x: (-p.viewport.x + 560) / p.viewport.zoom, y: (-p.viewport.y + 340) / p.viewport.zoom };
  return s.addNode(projectId, { kind, refId, text, w: NODE_WIDTH[kind], ...freeSpot(p, kind, center) });
}
