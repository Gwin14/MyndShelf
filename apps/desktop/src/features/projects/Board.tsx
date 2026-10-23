import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { BookOpen, Copy, ExternalLink, Link2, Maximize, Minus, PanelRight, Plus, RotateCcw, Shuffle, StickyNote, Trash2, Unlink, X } from "lucide-react";
import { VIEW_LABELS, viewModeOf } from "@myndshelf/core";
import type { BoardNode, Project, Viewport } from "@myndshelf/types";
import { NODE_WIDTH, placeNode } from "../../lib/board";
import { library } from "../../lib/store";
import { menu, sep, type MaybeEntry } from "../../lib/contextMenu";
import { docKindOf, docLabel } from "../../lib/documents";
import { openExternal } from "../../lib/platform";
import { useUi } from "../../lib/ui";
import { BoardNodeView } from "./BoardNodeView";

export const DND_TYPE = "application/x-myndshelf";

type Drag = { id: string; dx: number; dy: number; x: number; y: number };
type Link = { from: string; x: number; y: number };

const clampZoom = (z: number) => Math.min(2.5, Math.max(0.2, z));

/**
 * Quadro infinito: arrastar o fundo move a câmera, roda/pinça dá zoom,
 * nós se arrastam e o ponto ✦ na borda cria ligações.
 */
export function Board({ project }: { project: Project }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState<Viewport>(project.viewport);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [link, setLink] = useState<Link | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const sizes = useRef(new Map<string, { w: number; h: number }>());
  const [, remeasure] = useReducer((x: number) => x + 1, 0);
  const vpRef = useRef(vp);
  vpRef.current = vp;

  // salva a câmera com calma
  useEffect(() => {
    const t = setTimeout(() => library.getState().setViewport(project.id, vp), 400);
    return () => clearTimeout(t);
  }, [vp, project.id]);

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = ref.current!.getBoundingClientRect();
    const v = vpRef.current;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  }, []);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const r = ref.current!.getBoundingClientRect();
    const px = cx ?? r.left + r.width / 2;
    const py = cy ?? r.top + r.height / 2;
    setVp((v) => {
      const zoom = clampZoom(v.zoom * factor);
      const k = zoom / v.zoom;
      return { zoom, x: px - r.left - (px - r.left - v.x) * k, y: py - r.top - (py - r.top - v.y) * k };
    });
  }, []);

  // roda: pan; ⌘/ctrl + roda ou pinça: zoom (listener não-passivo)
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      else setVp((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // apagar seleção
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || !(e.key === "Delete" || e.key === "Backspace")) return;
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable) return;
      const s = library.getState();
      if (project.edges.some((x) => x.id === selected)) s.disconnect(project.id, selected);
      else s.removeNode(project.id, selected);
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, project]);

  /* ── interação ── */

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // botão direito abre o menu, não arrasta a câmera
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("board-layer")) return;
    setSelected(null);
    setPanning(true);
    const start = { x: e.clientX, y: e.clientY, vx: vp.x, vy: vp.y };
    const move = (ev: PointerEvent) => setVp((v) => ({ ...v, x: start.vx + ev.clientX - start.x, y: start.vy + ev.clientY - start.y }));
    const up = () => {
      setPanning(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onNodeDown = (e: React.PointerEvent, node: BoardNode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelected(node.id);
    const w = toWorld(e.clientX, e.clientY);
    let current: Drag = { id: node.id, dx: w.x - node.x, dy: w.y - node.y, x: node.x, y: node.y };
    let moved = false;
    const move = (ev: PointerEvent) => {
      const p = toWorld(ev.clientX, ev.clientY);
      current = { ...current, x: p.x - current.dx, y: p.y - current.dy };
      moved = true;
      setDrag(current);
    };
    const up = () => {
      if (moved) library.getState().updateNode(project.id, node.id, { x: current.x, y: current.y });
      setDrag(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onPortDown = (e: React.PointerEvent, node: BoardNode) => {
    e.stopPropagation();
    e.preventDefault();
    setLink({ from: node.id, ...toWorld(e.clientX, e.clientY) });
    const move = (ev: PointerEvent) => setLink({ from: node.id, ...toWorld(ev.clientX, ev.clientY) });
    const up = (ev: PointerEvent) => {
      const target = document
        .elementsFromPoint(ev.clientX, ev.clientY)
        .map((el) => el.closest<HTMLElement>("[data-node-id]"))
        .find((el) => el && el.dataset.nodeId !== node.id);
      if (target?.dataset.nodeId) library.getState().connect(project.id, node.id, target.dataset.nodeId);
      setLink(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(DND_TYPE);
    if (!raw) return;
    e.preventDefault();
    const { kind, refId } = JSON.parse(raw) as { kind: "capture" | "creation"; refId: string };
    const p = toWorld(e.clientX, e.clientY);
    const id = library.getState().addNode(project.id, { kind, refId, w: NODE_WIDTH[kind], x: p.x - NODE_WIDTH[kind] / 2, y: p.y - 60 });
    setSelected(id);
  };

  const fit = () => {
    if (!project.nodes.length) return setVp({ x: 0, y: 0, zoom: 1 });
    const r = ref.current!.getBoundingClientRect();
    const boxes = project.nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: sizes.current.get(n.id)?.h ?? 200 }));
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const maxY = Math.max(...boxes.map((b) => b.y + b.h));
    const zoom = clampZoom(Math.min((r.width - 160) / (maxX - minX), (r.height - 200) / (maxY - minY), 1.2));
    setVp({ zoom, x: (r.width - (maxX - minX) * zoom) / 2 - minX * zoom, y: (r.height - (maxY - minY) * zoom) / 2 - minY * zoom + 30 });
  };

  /* ── menus de clique direito ── */

  const s = () => library.getState();
  const nodeLabel = (n: BoardNode) =>
    (n.kind === "capture"
      ? s().captures.find((c) => c.id === n.refId)?.title
      : n.kind === "creation"
        ? s().creations.find((c) => c.id === n.refId)?.title
        : n.text?.split("\n")[0]) || "Nota";

  const nodeMenu = (node: BoardNode): MaybeEntry[] => {
    const capture = node.kind === "capture" ? s().captures.find((c) => c.id === node.refId) : undefined;
    const creation = node.kind === "creation" ? s().creations.find((c) => c.id === node.refId) : undefined;
    const mode = capture ? viewModeOf(capture) : undefined;
    const doc = creation ? docKindOf(creation) : undefined;
    const edges = project.edges.filter((e) => e.from === node.id || e.to === node.id);
    const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
    const others = project.nodes.filter((n) => n.id !== node.id);
    return [
      { heading: nodeLabel(node) },
      capture && { label: "Abrir detalhes", icon: <PanelRight size={14} />, onSelect: () => useUi.getState().set({ openCaptureId: capture.id }) },
      capture && mode && { label: VIEW_LABELS[mode], icon: <BookOpen size={14} />, onSelect: () => useUi.getState().set({ viewerCaptureId: capture.id }) },
      capture?.url && { label: "Abrir original", icon: <ExternalLink size={14} />, onSelect: () => void openExternal(capture.url!) },
      creation && { label: "Abrir detalhes", icon: <PanelRight size={14} />, onSelect: () => useUi.getState().set({ openCreationId: creation.id }) },
      creation && doc && { label: `Abrir ${docLabel(doc, creation.fileName)}`, icon: <BookOpen size={14} />, onSelect: () => useUi.getState().set({ readingCreationId: creation.id }) },
      sep,
      others.length > 0 && {
        label: "Ligar a",
        icon: <Link2 size={14} />,
        children: others.slice(0, 20).map((n) => ({
          label: nodeLabel(n),
          checked: linked.has(n.id),
          onSelect: () => s().connect(project.id, node.id, n.id),
        })),
      },
      edges.length > 0 && {
        label: "Desfazer ligações",
        icon: <Unlink size={14} />,
        hint: String(edges.length),
        onSelect: () => edges.forEach((e) => s().disconnect(project.id, e.id)),
      },
      sep,
      { label: "Endireitar", icon: <RotateCcw size={14} />, disabled: node.rotation === 0, onSelect: () => s().updateNode(project.id, node.id, { rotation: 0 }) },
      {
        label: "Inclinar",
        icon: <Shuffle size={14} />,
        onSelect: () => s().updateNode(project.id, node.id, { rotation: Math.round((Math.random() - 0.5) * 12 * 10) / 10 }),
      },
      {
        label: "Duplicar",
        icon: <Copy size={14} />,
        onSelect: () => {
          const id = s().addNode(project.id, { kind: node.kind, refId: node.refId, text: node.text, w: node.w, x: node.x + 36, y: node.y + 36 });
          setSelected(id);
        },
      },
      sep,
      { label: "Tirar do quadro", icon: <Trash2 size={14} />, danger: true, onSelect: () => s().removeNode(project.id, node.id) },
    ];
  };

  /** Clique direito no fundo: criar ali mesmo, onde o mouse está. */
  const backgroundMenu = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t !== e.currentTarget && !t.classList.contains("board-layer")) return;
    const p = toWorld(e.clientX, e.clientY);
    const at = (kind: "capture" | "creation" | "text", refId?: string) => {
      const w = NODE_WIDTH[kind];
      const id = s().addNode(project.id, { kind, refId, text: kind === "text" ? "" : undefined, w, x: p.x - w / 2, y: p.y - 40 });
      setSelected(id);
    };
    const recentCaptures = s().captures.filter((c) => c.status === "ready").slice(0, 10);
    const recentCreations = s().creations.slice(0, 10);
    menu(() => [
      { label: "Nova nota aqui", icon: <StickyNote size={14} />, onSelect: () => at("text") },
      recentCaptures.length > 0 && {
        label: "Trazer da Captura",
        icon: <Plus size={14} />,
        children: recentCaptures.map((c) => ({ label: c.title, onSelect: () => at("capture", c.id) })),
      },
      recentCreations.length > 0 && {
        label: "Trazer da Estante",
        icon: <Plus size={14} />,
        children: recentCreations.map((c) => ({ label: c.title, onSelect: () => at("creation", c.id) })),
      },
      sep,
      { label: "Enquadrar tudo", icon: <Maximize size={14} />, disabled: !project.nodes.length, onSelect: fit },
      { label: "Zoom 100%", hint: `${Math.round(vp.zoom * 100)}%`, onSelect: () => setVp((v) => ({ ...v, zoom: 1 })) },
    ])(e);
  };

  /* ── geometria ── */

  const pos = (n: BoardNode) => (drag?.id === n.id ? { x: drag.x, y: drag.y } : { x: n.x, y: n.y });
  const center = (id: string) => {
    const n = project.nodes.find((x) => x.id === id);
    if (!n) return null;
    const p = pos(n);
    const s = sizes.current.get(id);
    return { x: p.x + n.w / 2, y: p.y + (s?.h ?? 200) / 2 };
  };
  const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x;
    const c = Math.max(40, Math.abs(dx) * 0.45) * Math.sign(dx || 1);
    return `M ${a.x} ${a.y} C ${a.x + c} ${a.y}, ${b.x - c} ${b.y}, ${b.x} ${b.y}`;
  };

  const gridSize = 32 * vp.zoom;

  return (
    <div
      ref={ref}
      className="board"
      data-panning={panning || undefined}
      style={{ backgroundSize: `${gridSize}px ${gridSize}px`, backgroundPosition: `${vp.x}px ${vp.y}px` }}
      onPointerDown={onBackgroundDown}
      onContextMenu={backgroundMenu}
      onDragOver={(e) => e.dataTransfer.types.includes(DND_TYPE) && e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="board-layer" style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` }}>
        <svg className="board-edges">
          <defs>
            <filter id="edge-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>
          {project.edges.map((edge) => {
            const a = center(edge.from);
            const b = center(edge.to);
            if (!a || !b) return null;
            const d = curve(a, b);
            const gid = `g-${edge.id}`;
            const isSel = selected === edge.id;
            return (
              <g key={edge.id} className="edge" data-selected={isSel || undefined}>
                <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
                  <stop offset="0" stopColor="var(--c-cyan)" />
                  <stop offset="0.45" stopColor="var(--c-sun)" />
                  <stop offset="0.7" stopColor="var(--c-amber)" />
                  <stop offset="1" stopColor="var(--c-ember)" />
                </linearGradient>
                <path d={d} stroke={`url(#${gid})`} strokeWidth={isSel ? 7 : 5} fill="none" opacity={0.45} filter="url(#edge-glow)" />
                <path d={d} stroke={`url(#${gid})`} strokeWidth={isSel ? 2.4 : 1.6} fill="none" className="edge-line" />
                <path
                  d={d}
                  stroke="transparent"
                  strokeWidth={16}
                  fill="none"
                  className="edge-hit"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelected(edge.id);
                  }}
                  onContextMenu={menu(() => [
                    { heading: `${nodeLabel(project.nodes.find((n) => n.id === edge.from)!)} ↔ ${nodeLabel(project.nodes.find((n) => n.id === edge.to)!)}` },
                    { label: "Remover ligação", icon: <Unlink size={14} />, danger: true, onSelect: () => s().disconnect(project.id, edge.id) },
                  ])}
                />
                <circle cx={a.x} cy={a.y} r={3} fill="var(--c-cyan)" />
                <circle cx={b.x} cy={b.y} r={3} fill="var(--c-ember)" />
              </g>
            );
          })}
          {link &&
            (() => {
              const a = center(link.from);
              return a ? <path d={curve(a, link)} className="edge-draft" fill="none" /> : null;
            })()}
        </svg>

        {project.edges.map((edge) => {
          if (selected !== edge.id) return null;
          const a = center(edge.from);
          const b = center(edge.to);
          if (!a || !b) return null;
          return (
            <button
              key={edge.id}
              className="edge-remove"
              style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                library.getState().disconnect(project.id, edge.id);
                setSelected(null);
              }}
            >
              <X size={12} />
            </button>
          );
        })}

        {project.nodes.map((node) => (
          <BoardNodeView
            key={node.id}
            node={node}
            position={pos(node)}
            dragging={drag?.id === node.id}
            selected={selected === node.id}
            linking={!!link && link.from !== node.id}
            projectId={project.id}
            onPointerDown={(e) => onNodeDown(e, node)}
            onPortDown={(e) => onPortDown(e, node)}
            menuEntries={() => nodeMenu(node)}
            onMeasure={(w, h) => {
              const prev = sizes.current.get(node.id);
              if (prev?.h !== h || prev?.w !== w) {
                sizes.current.set(node.id, { w, h });
                remeasure();
              }
            }}
          />
        ))}
      </div>

      {!project.nodes.length && (
        <div className="board-empty">
          <div className="empty-orbit" />
          <p className="empty-title">Um céu em branco.</p>
          <p>Arraste referências e criações da barra lateral, ou crie uma nota.</p>
        </div>
      )}

      <div className="board-toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <button className="icon-btn" onClick={() => zoomAt(1 / 1.2)} title="Afastar">
          <Minus size={15} />
        </button>
        <button className="board-zoom mono" onClick={() => setVp((v) => ({ ...v, zoom: 1 }))} title="100%">
          {Math.round(vp.zoom * 100)}%
        </button>
        <button className="icon-btn" onClick={() => zoomAt(1.2)} title="Aproximar">
          <Plus size={15} />
        </button>
        <span className="board-sep" />
        <button className="icon-btn" onClick={fit} title="Enquadrar tudo">
          <Maximize size={15} />
        </button>
        <button
          className="btn board-note"
          onClick={() => {
            const id = placeNode(project.id, "text", undefined, "");
            if (id) setSelected(id);
          }}
        >
          <StickyNote size={14} /> Nota
        </button>
      </div>
    </div>
  );
}
