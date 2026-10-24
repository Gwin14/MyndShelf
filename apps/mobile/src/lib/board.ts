import { Dimensions } from "react-native";
import { freeSpot, NODE_WIDTH } from "@myndshelf/core";
import type { BoardNodeKind } from "@myndshelf/types";
import { library } from "./store";

export { NODE_WIDTH };

/** O mundo do quadro é uma vista enorme com a origem no meio: toques fora dos limites de uma vista se perdem no Android. */
export const WORLD = 20000;

/** Coloca um nó perto do centro visível do quadro, na primeira vaga livre de uma espiral. */
export function placeNode(projectId: string, kind: BoardNodeKind, refId?: string, text?: string) {
  const s = library.getState();
  const p = s.projects.find((x) => x.id === projectId);
  if (!p) return;
  const { width, height } = Dimensions.get("window");
  const center = { x: (-p.viewport.x + width / 2) / p.viewport.zoom, y: (-p.viewport.y + height / 2) / p.viewport.zoom };
  return s.addNode(projectId, { kind, refId, text, w: NODE_WIDTH[kind], ...freeSpot(p, kind, center) });
}
