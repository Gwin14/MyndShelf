import { useState } from "react";
import { Archive, Code, FileText, Folder, Image, Inbox, Layers, Music, Plus, Shapes, Star, Video, X } from "lucide-react";
import { MEDIUM_LABELS } from "@myndshelf/core";
import type { CreationMedium } from "@myndshelf/types";
import { SideItem, SideSection } from "../../components/SideSection";
import { addCreationsFromFiles, pickFiles } from "../../lib/files";
import { library, useLibrary } from "../../lib/store";
import { useUi } from "../../lib/ui";

const MEDIUM_ICONS: Record<CreationMedium, React.JSX.Element> = {
  image: <Image size={15} />,
  document: <Archive size={15} />,
  audio: <Music size={15} />,
  video: <Video size={15} />,
  text: <FileText size={15} />,
  code: <Code size={15} />,
  folder: <Folder size={15} />,
  object: <Shapes size={15} />,
};

export function ShelfSidebar() {
  const creations = useLibrary((s) => s.creations);
  const shelves = useLibrary((s) => s.shelves);
  const { shelfFilter, shelfMedium, set } = useUi();
  const [draft, setDraft] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const targetShelf = shelves.some((s) => s.id === shelfFilter) ? shelfFilter : null;

  return (
    <>
      <button
        className="btn btn-flare side-cta"
        onClick={async () => addCreationsFromFiles(await pickFiles("*/*"), targetShelf)}
      >
        <Plus size={15} /> Adicionar criações
      </button>

      <SideSection title="Acervo">
        <SideItem icon={<Layers size={15} />} label="Tudo" count={creations.length} active={shelfFilter === "all"} onClick={() => set({ shelfFilter: "all" })} />
        <SideItem
          icon={<Star size={15} />}
          label="Vitrine"
          count={creations.filter((c) => c.featured).length}
          active={shelfFilter === "featured"}
          onClick={() => set({ shelfFilter: "featured" })}
        />
        <SideItem
          icon={<Inbox size={15} />}
          label="Entrada"
          count={creations.filter((c) => !c.shelfId).length}
          active={shelfFilter === "loose"}
          onClick={() => set({ shelfFilter: "loose" })}
        />
      </SideSection>

      <SideSection
        title="Estantes"
        action={
          <button className="icon-btn side-mini" onClick={() => setDraft("")} title="Nova estante">
            <Plus size={13} />
          </button>
        }
      >
        {shelves.map((s) =>
          renaming === s.id ? (
            <input
              key={s.id}
              className="field side-input"
              autoFocus
              defaultValue={s.name}
              onBlur={(e) => {
                if (e.target.value.trim()) library.getState().renameShelf(s.id, e.target.value.trim());
                setRenaming(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          ) : (
            <div key={s.id} onDoubleClick={() => setRenaming(s.id)}>
              <SideItem
                icon={<span className="shelf-glyph" />}
                label={s.name}
                count={creations.filter((c) => c.shelfId === s.id).length}
                active={shelfFilter === s.id}
                onClick={() => set({ shelfFilter: s.id })}
              >
                <button
                  className="side-remove"
                  title="Apagar estante (as obras voltam para a entrada)"
                  onClick={(e) => {
                    e.stopPropagation();
                    library.getState().removeShelf(s.id);
                    if (shelfFilter === s.id) set({ shelfFilter: "all" });
                  }}
                >
                  <X size={12} />
                </button>
              </SideItem>
            </div>
          ),
        )}
        {draft !== null && (
          <input
            className="field side-input"
            autoFocus
            placeholder="Nome da estante"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft.trim()) set({ shelfFilter: library.getState().addShelf(draft.trim()) });
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setDraft(null);
            }}
          />
        )}
        {!shelves.length && draft === null && (
          <p className="side-empty">Crie estantes para separar fases, séries ou suportes.</p>
        )}
      </SideSection>

      <SideSection title="Suporte">
        <SideItem label="Todos" active={shelfMedium === "all"} onClick={() => set({ shelfMedium: "all" })} icon={<span>∗</span>} />
        {(Object.keys(MEDIUM_LABELS) as CreationMedium[]).map((m) => (
          <SideItem
            key={m}
            icon={MEDIUM_ICONS[m]}
            label={MEDIUM_LABELS[m]}
            count={creations.filter((c) => c.medium === m).length || undefined}
            active={shelfMedium === m}
            onClick={() => set({ shelfMedium: m })}
          />
        ))}
      </SideSection>

      <div className="side-hint">
        <strong>Coisas, não não-coisas.</strong>
        Arquivos soltos somem na nuvem. Aqui cada criação ganha corpo, lugar e tempo.
      </div>
    </>
  );
}
