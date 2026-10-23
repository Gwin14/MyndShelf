import { Plus } from "lucide-react";
import type { Project } from "@myndshelf/types";
import { relativeDate } from "@myndshelf/core";
import { Headline } from "../../components/Headline";
import { library, useLibrary } from "../../lib/store";
import { useUi } from "../../lib/ui";
import { Board } from "./Board";
import { menu } from "../../lib/contextMenu";
import { projectMenu } from "../../lib/menus";

export function ProjectsView() {
  const projects = useLibrary((s) => s.projects);
  const activeId = useUi((s) => s.activeProjectId);
  const set = useUi((s) => s.set);
  const active = projects.find((p) => p.id === activeId);

  if (active) {
    return (
      <div className="board-wrap">
        <div className="board-head">
          <p className="kicker">
            III — Projeto · {active.nodes.length} objetos · {active.edges.length} ligações
          </p>
          <input
            className="board-title"
            value={active.name}
            onChange={(e) => library.getState().updateProject(active.id, { name: e.target.value })}
          />
        </div>
        <Board key={active.id} project={active} />
      </div>
    );
  }

  const create = () => set({ activeProjectId: library.getState().createProject("Novo projeto") });

  return (
    <div className="stage-pad">
      <Headline
        kicker={`III — Projetos · ${projects.length} constelações`}
        aside={
          <button className="btn btn-flare" onClick={create}>
            <Plus size={15} /> Novo projeto
          </button>
        }
      >
        Onde as coisas <em>se</em> encontram.
      </Headline>

      {projects.length ? (
        <div className="constellations">
          {projects.map((p, i) => (
            <button
              key={p.id}
              className="constellation"
              style={{ animationDelay: `${i * 50}ms`, "--hue": p.hue } as React.CSSProperties}
              onClick={() => set({ activeProjectId: p.id })}
              onContextMenu={menu(() => projectMenu(p.id))}
            >
              <ConstellationMap project={p} />
              <div className="constellation-info">
                <strong className="serif">{p.name}</strong>
                <span className="mono">
                  {p.nodes.length} objetos · {relativeDate(p.updatedAt)}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          <div className="empty-orbit" />
          <p className="empty-title">Nenhuma constelação ainda.</p>
          <p>Um projeto junta referências e criações num quadro livre, com ligações entre elas.</p>
          <button className="btn btn-flare" style={{ marginTop: 18 }} onClick={create}>
            <Plus size={15} /> Criar o primeiro
          </button>
        </div>
      )}
    </div>
  );
}

/** O quadro reduzido a um mapa estelar: nós viram estrelas, ligações viram traços. */
function ConstellationMap({ project }: { project: Project }) {
  const W = 300;
  const H = 170;
  const pts = project.nodes.map((n) => ({ id: n.id, x: n.x + n.w / 2, y: n.y + 100 }));
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const k = Math.min((W - 60) / (maxX - minX || 1), (H - 50) / (maxY - minY || 1), 0.4);
  const map = new Map(
    pts.map((p) => [p.id, { x: W / 2 + (p.x - (minX + maxX) / 2) * k, y: H / 2 + (p.y - (minY + maxY) / 2) * k }]),
  );

  return (
    <svg className="constellation-map" viewBox={`0 0 ${W} ${H}`}>
      {project.edges.map((e) => {
        const a = map.get(e.from);
        const b = map.get(e.to);
        return a && b ? <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null;
      })}
      {[...map.entries()].map(([id, p], i) => (
        <g key={id} transform={`translate(${p.x} ${p.y})`}>
          <circle r={i % 3 === 0 ? 3.2 : 2.2} className="star" />
          <circle r={9} className="star-halo" />
        </g>
      ))}
      {!pts.length && (
        <text x={W / 2} y={H / 2} textAnchor="middle" className="constellation-empty">
          céu vazio
        </text>
      )}
    </svg>
  );
}
