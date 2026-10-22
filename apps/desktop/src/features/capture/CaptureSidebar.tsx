import { useMemo } from "react";
import { Search, Sparkles, Tag } from "lucide-react";
import { KIND_LABELS } from "@myndshelf/core";
import type { CaptureKind } from "@myndshelf/types";
import { SideItem, SideSection } from "../../components/SideSection";
import { useLibrary } from "../../lib/store";
import { useUi } from "../../lib/ui";
import { KIND_ICONS } from "./kindIcons";

export function CaptureSidebar() {
  const captures = useLibrary((s) => s.captures);
  const { captureKind, captureTag, captureQuery, set } = useUi();

  const counts = useMemo(() => {
    const m = new Map<CaptureKind, number>();
    for (const c of captures) m.set(c.kind, (m.get(c.kind) ?? 0) + 1);
    return m;
  }, [captures]);

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of captures) for (const t of c.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [captures]);

  return (
    <>
      <div className="side-search">
        <Search size={14} />
        <input
          className="field"
          placeholder="Buscar no céu…"
          value={captureQuery}
          onChange={(e) => set({ captureQuery: e.target.value })}
        />
      </div>

      <SideSection title="Constelações">
        <SideItem
          icon={<Sparkles size={15} />}
          label="Tudo"
          count={captures.length}
          active={captureKind === "all"}
          onClick={() => set({ captureKind: "all" })}
        />
        {(Object.keys(KIND_LABELS) as CaptureKind[])
          .filter((k) => counts.get(k))
          .map((k) => (
            <SideItem
              key={k}
              icon={KIND_ICONS[k]}
              label={KIND_LABELS[k]}
              count={counts.get(k)}
              active={captureKind === k}
              onClick={() => set({ captureKind: k })}
            />
          ))}
      </SideSection>

      {tags.length > 0 && (
        <SideSection title="Etiquetas">
          {tags.map(([t, n]) => (
            <SideItem
              key={t}
              icon={<Tag size={13} />}
              label={t}
              count={n}
              active={captureTag === t}
              onClick={() => set({ captureTag: captureTag === t ? null : t })}
            />
          ))}
        </SideSection>
      )}

      <div className="side-hint">
        <strong>Capture sem pensar.</strong>
        Cole um link com ⌘V em qualquer lugar ou arraste imagens para a tela. A capa se ajusta ao que for: disco,
        livro, filme…
      </div>
    </>
  );
}
