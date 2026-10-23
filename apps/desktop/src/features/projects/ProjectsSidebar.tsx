import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Search, X } from "lucide-react";
import { SideItem, SideSection } from "../../components/SideSection";
import { placeNode } from "../../lib/board";
import { library, useLibrary } from "../../lib/store";
import { useUi } from "../../lib/ui";
import { DND_TYPE } from "./Board";
import { menu } from "../../lib/contextMenu";
import { projectMenu } from "../../lib/menus";
import { Plus as PlusIcon } from "lucide-react";

export function ProjectsSidebar() {
  const projects = useLibrary((s) => s.projects);
  const captures = useLibrary((s) => s.captures);
  const creations = useLibrary((s) => s.creations);
  const activeId = useUi((s) => s.activeProjectId);
  const set = useUi((s) => s.set);
  const [source, setSource] = useState<"capture" | "creation">("capture");
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);

  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list =
      source === "capture"
        ? captures.filter((c) => c.status !== "loading").map((c) => ({ id: c.id, title: c.title, thumb: c.image, hue: c.hue, sub: c.siteName }))
        : creations.map((c) => ({ id: c.id, title: c.title, thumb: c.preview, hue: c.hue, sub: c.fileName }));
    return q ? list.filter((x) => x.title.toLowerCase().includes(q)) : list;
  }, [source, captures, creations, query]);

  return (
    <>
      <button
        className="btn btn-flare side-cta"
        onClick={() => set({ activeProjectId: library.getState().createProject("Novo projeto") })}
      >
        <Plus size={15} /> Novo projeto
      </button>

      {activeId && (
        <SideItem icon={<ArrowLeft size={15} />} label="Todos os projetos" onClick={() => set({ activeProjectId: null })} />
      )}

      <SideSection title="Constelações">
        {projects.map((p) =>
          renaming === p.id ? (
            <input
              key={p.id}
              className="field side-input"
              autoFocus
              defaultValue={p.name}
              onBlur={(e) => {
                if (e.target.value.trim()) library.getState().updateProject(p.id, { name: e.target.value.trim() });
                setRenaming(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          ) : (
            <div key={p.id} onDoubleClick={() => setRenaming(p.id)} onContextMenu={menu(() => projectMenu(p.id, () => setRenaming(p.id)))}>
              <SideItem
                icon={<span className="planet" style={{ "--hue": p.hue } as React.CSSProperties} />}
                label={p.name}
                count={p.nodes.length}
                active={activeId === p.id}
                onClick={() => set({ activeProjectId: p.id })}
              >
                <button
                  className="side-remove"
                  title="Apagar projeto"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!confirm(`Apagar “${p.name}”? Os itens continuam na Captura e na Estante.`)) return;
                    library.getState().removeProject(p.id);
                    if (activeId === p.id) set({ activeProjectId: null });
                  }}
                >
                  <X size={12} />
                </button>
              </SideItem>
            </div>
          ),
        )}
        {!projects.length && <p className="side-empty">Nenhum projeto ainda.</p>}
      </SideSection>

      {activeId && (
        <SideSection title="Trazer para o quadro">
          <div className="seg seg-full">
            <button aria-pressed={source === "capture"} onClick={() => setSource("capture")}>
              Captura
            </button>
            <button aria-pressed={source === "creation"} onClick={() => setSource("creation")}>
              Estante
            </button>
          </div>
          <div className="side-search" style={{ marginTop: 8 }}>
            <Search size={14} />
            <input className="field" placeholder="Filtrar…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="pool">
            {pool.map((x) => (
              <div
                key={x.id}
                className="pool-item"
                draggable
                title="Arraste para o quadro ou clique para adicionar"
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND_TYPE, JSON.stringify({ kind: source, refId: x.id }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => placeNode(activeId, source, x.id)}
                onContextMenu={menu(() => [
                  { heading: x.title },
                  { label: "Adicionar ao quadro", icon: <PlusIcon size={14} />, onSelect: () => placeNode(activeId, source, x.id) },
                  {
                    label: "Abrir detalhes",
                    onSelect: () => set(source === "capture" ? { openCaptureId: x.id } : { openCreationId: x.id }),
                  },
                ])}
              >
                <span className="pool-thumb" style={{ "--hue": x.hue } as React.CSSProperties}>
                  {x.thumb && <img src={x.thumb} alt="" referrerPolicy="no-referrer" draggable={false} />}
                </span>
                <span className="pool-text">
                  <span>{x.title}</span>
                  <span className="mono">{x.sub}</span>
                </span>
              </div>
            ))}
            {!pool.length && <p className="side-empty">Nada por aqui ainda.</p>}
          </div>
        </SideSection>
      )}

      {!activeId && (
        <div className="side-hint">
          <strong>Ligue os pontos.</strong>
          Num projeto, arraste o ✦ na borda de um item até outro para criar uma ligação.
        </div>
      )}
    </>
  );
}
