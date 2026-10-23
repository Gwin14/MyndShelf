import { useMemo, useState } from "react";
import { LayoutGrid, Library, Plus } from "lucide-react";
import type { Creation } from "@myndshelf/types";
import { MEDIUM_LABELS } from "@myndshelf/core";
import { Headline } from "../../components/Headline";
import { addCreationsFromFiles, addFolderFromEntry, pickFiles } from "../../lib/files";
import { useLibrary } from "../../lib/store";
import { useUi } from "../../lib/ui";
import { ShelfObject } from "./ShelfObject";
import { menu } from "../../lib/contextMenu";
import { creationMenu } from "../../lib/menus";

export function ShelfView() {
  const creations = useLibrary((s) => s.creations);
  const shelves = useLibrary((s) => s.shelves);
  const { shelfView, shelfFilter, shelfMedium, set } = useUi();
  const [dragging, setDragging] = useState(false);
  const nativeDrag = useUi((s) => s.nativeDrag);

  const visible = useMemo(
    () =>
      creations.filter(
        (c) =>
          (shelfMedium === "all" || c.medium === shelfMedium) &&
          (shelfFilter === "all" ||
            (shelfFilter === "featured" && c.featured) ||
            (shelfFilter === "loose" && !c.shelfId) ||
            c.shelfId === shelfFilter),
      ),
    [creations, shelfFilter, shelfMedium],
  );

  // agrupa por estante física; itens soltos ficam na "Prateleira de entrada"
  const rows = useMemo(() => {
    const out: { id: string; name: string; items: Creation[] }[] = [];
    const loose = visible.filter((c) => !c.shelfId || !shelves.some((s) => s.id === c.shelfId));
    for (const s of shelves) {
      const items = visible.filter((c) => c.shelfId === s.id);
      if (items.length) out.push({ id: s.id, name: s.name, items });
    }
    if (loose.length) out.unshift({ id: "loose", name: "Prateleira de entrada", items: loose });
    return out;
  }, [visible, shelves]);

  const featured = shelfFilter === "all" ? visible.filter((c) => c.featured).slice(0, 5) : [];
  const targetShelf = shelfFilter !== "all" && shelfFilter !== "featured" && shelfFilter !== "loose" ? shelfFilter : null;
  const open = (id: string) => set({ openCreationId: id });

  return (
    <div
      className="stage-pad shelf-stage"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        // pastas chegam como "entradas de diretório"; arquivos seguem normais
        const entries = Array.from(e.dataTransfer.items).map((it) => it.webkitGetAsEntry?.());
        const files = Array.from(e.dataTransfer.files).filter((_, i) => !entries[i]?.isDirectory);
        entries.forEach((entry) => entry?.isDirectory && void addFolderFromEntry(entry as FileSystemDirectoryEntry, targetShelf));
        void addCreationsFromFiles(files, targetShelf);
      }}
    >
      <Headline
        kicker={`II — Estante · ${visible.length} ${visible.length === 1 ? "criação" : "criações"}`}
        aside={
          <div className="seg">
            <button aria-pressed={shelfView === "shelf"} onClick={() => set({ shelfView: "shelf" })} title="Estante">
              <Library size={15} />
            </button>
            <button aria-pressed={shelfView === "gallery"} onClick={() => set({ shelfView: "gallery" })} title="Galeria">
              <LayoutGrid size={15} />
            </button>
          </div>
        }
      >
        O que você <em>fez</em> existir.
      </Headline>

      {!visible.length && (
        <div className="empty">
          <div className="empty-orbit" />
          <p className="empty-title">Uma estante esperando suas coisas.</p>
          <p>Arraste arquivos para cá — ilustrações, faixas, PDFs, vídeos — e eles ganham corpo.</p>
          <button
            className="btn btn-flare"
            style={{ marginTop: 18 }}
            onClick={async () => addCreationsFromFiles(await pickFiles("*/*"), targetShelf)}
          >
            <Plus size={15} /> Adicionar criações
          </button>
        </div>
      )}

      {shelfView === "shelf" && featured.length > 0 && (
        <section className="vitrine">
          <span className="vitrine-beam" />
          <p className="kicker vitrine-kicker">✦ Vitrine</p>
          <div className="vitrine-items">
            {featured.map((c) => (
              <button key={c.id} className="vitrine-item" onClick={() => open(c.id)} onContextMenu={menu(() => creationMenu(c))}>
                <ShelfObject item={c} />
                <span className="placard">
                  <em>{c.title}</em>
                  <span className="mono">{c.year}</span>
                </span>
              </button>
            ))}
          </div>
          <span className="vitrine-floor" />
        </section>
      )}

      {shelfView === "shelf" &&
        rows.map((row, r) => (
          <section className="shelf-row" key={row.id} style={{ animationDelay: `${r * 80}ms` }}>
            <header className="shelf-plaque">
              <span className="serif">{row.name}</span>
              <span className="mono">{row.items.length}</span>
            </header>
            <div className="shelf-items">
              {row.items.map((c, i) => (
                <button
                  key={c.id}
                  className="shelf-item"
                  onClick={() => open(c.id)}
                  onContextMenu={menu(() => creationMenu(c))}
                  style={{ "--lean": `${((c.hue % 7) - 3) * 0.6}deg`, animationDelay: `${i * 40}ms` } as React.CSSProperties}
                >
                  <ShelfObject item={c} />
                  <span className="shelf-tag mono">{c.title}</span>
                </button>
              ))}
            </div>
            <div className="shelf-plank" />
          </section>
        ))}

      {shelfView === "gallery" && visible.length > 0 && (
        <div className="gallery">
          {visible.map((c, i) => (
            <button key={c.id} className="gallery-item" onClick={() => open(c.id)} onContextMenu={menu(() => creationMenu(c))} style={{ animationDelay: `${Math.min(i, 16) * 30}ms` }}>
              <div className="gallery-wall">
                <ShelfObject item={c} />
              </div>
              <div className="wall-label">
                <em>{c.title}</em>
                <span>
                  {MEDIUM_LABELS[c.medium]}
                  {c.year ? `, ${c.year}` : ""}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {(dragging || nativeDrag) && <div className="drop-veil">Solte para pôr na estante ✦</div>}
    </div>
  );
}
