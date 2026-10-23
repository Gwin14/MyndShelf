import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { BoardNode } from "@myndshelf/types";
import { library, useLibrary } from "../../lib/store";
import { menu, type MaybeEntry } from "../../lib/contextMenu";
import { Pencil } from "lucide-react";
import { Cover, SELF_CAPTIONED } from "../capture/covers/Cover";
import { ShelfObject } from "../shelf/ShelfObject";

interface Props {
  node: BoardNode;
  position: { x: number; y: number };
  dragging: boolean;
  selected: boolean;
  linking: boolean;
  projectId: string;
  onPointerDown(e: React.PointerEvent): void;
  onPortDown(e: React.PointerEvent): void;
  onMeasure(w: number, h: number): void;
  /** ações do quadro para este nó (o "Editar texto" das notas é adicionado aqui) */
  menuEntries(): MaybeEntry[];
}

export function BoardNodeView({ node, position, dragging, selected, linking, projectId, onPointerDown, onPortDown, onMeasure, menuEntries }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const capture = useLibrary((s) => (node.kind === "capture" ? s.captures.find((c) => c.id === node.refId) : undefined));
  const creation = useLibrary((s) => (node.kind === "creation" ? s.creations.find((c) => c.id === node.refId) : undefined));
  const [editing, setEditing] = useState(node.kind === "text" && !node.text);

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => onMeasure(el.offsetWidth, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (node.kind !== "text" && !capture && !creation) return null;

  return (
    <div
      ref={ref}
      className="bn"
      data-node-id={node.id}
      data-kind={node.kind}
      data-dragging={dragging || undefined}
      data-selected={selected || undefined}
      data-linking={linking || undefined}
      style={{ left: position.x, top: position.y, width: node.w, "--rot": `${node.rotation}deg` } as React.CSSProperties}
      onPointerDown={editing ? (e) => e.stopPropagation() : onPointerDown}
      onDoubleClick={() => node.kind === "text" && setEditing(true)}
      onContextMenu={menu(() => {
        const [heading, ...rest] = menuEntries();
        return node.kind === "text"
          ? [heading, { label: "Editar texto", icon: <Pencil size={14} />, onSelect: () => setEditing(true) }, ...rest]
          : [heading, ...rest];
      })}
    >
      <div className="bn-body">
        {capture && (
          <>
            <Cover item={capture} />
            {!SELF_CAPTIONED.has(capture.kind) && <p className="bn-caption serif">{capture.title}</p>}
          </>
        )}
        {creation && (
          <div className="bn-creation">
            <ShelfObject item={creation} />
            <p className="bn-caption serif">{creation.title}</p>
          </div>
        )}
        {node.kind === "text" &&
          (editing ? (
            <textarea
              className="bn-text bn-text-edit"
              autoFocus
              defaultValue={node.text}
              placeholder="Escreva uma ideia…"
              onBlur={(e) => {
                const text = e.target.value.trim();
                if (!text) library.getState().removeNode(projectId, node.id);
                else library.getState().updateNode(projectId, node.id, { text });
                setEditing(false);
              }}
              onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
            />
          ) : (
            <p className="bn-text">{node.text}</p>
          ))}
      </div>

      <span className="bn-port" title="Arraste para ligar" onPointerDown={onPortDown}>
        ✦
      </span>
      <button
        className="bn-remove"
        title="Tirar do quadro"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => library.getState().removeNode(projectId, node.id)}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
