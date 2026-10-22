import { useState } from "react";
import type { BoardNodeKind } from "@myndshelf/types";
import { placeNode } from "../lib/board";
import { library, useLibrary } from "../lib/store";

/** Envia um item (captura ou criação) para o quadro de um projeto. */
export function AddToProject({ kind, refId }: { kind: Exclude<BoardNodeKind, "text">; refId: string }) {
  const projects = useLibrary((s) => s.projects);
  const [done, setDone] = useState<string | null>(null);

  const add = (projectId: string) => {
    const id = projectId === "__new" ? library.getState().createProject("Novo projeto") : projectId;
    placeNode(id, kind, refId);
    setDone(library.getState().projects.find((p) => p.id === id)?.name ?? "");
  };

  return (
    <div>
      <select className="field" value="" onChange={(e) => e.target.value && add(e.target.value)}>
        <option value="">Adicionar a um projeto…</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value="__new">+ Novo projeto</option>
      </select>
      {done && <p className="mono confirm">✦ adicionado a “{done}”</p>}
    </div>
  );
}
