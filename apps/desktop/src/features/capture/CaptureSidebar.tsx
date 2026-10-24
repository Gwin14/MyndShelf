import { useMemo, useState } from "react";
import { Plus, Radio, Sparkles, Tag } from "lucide-react";
import { describeFeedSource, isProbablyUrl, KIND_LABELS } from "@myndshelf/core";
import type { CaptureKind } from "@myndshelf/types";
import { SideItem, SideSection } from "../../components/SideSection";
import { subscribe } from "../../lib/feeds";
import { useLibrary } from "../../lib/store";
import { FeedIcon } from "./FeedIcon";
import { menu } from "../../lib/contextMenu";
import { feedMenu } from "../../lib/menus";
import { useUi } from "../../lib/ui";
import { KIND_ICONS } from "./kindIcons";

export function CaptureSidebar() {
  const captures = useLibrary((s) => s.captures);
  const feeds = useLibrary((s) => s.feeds);
  const entries = useLibrary((s) => s.feedEntries);
  const { captureKind, captureTag, captureFeed, set } = useUi();
  const [draft, setDraft] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const hint = draft && isProbablyUrl(draft) ? describeFeedSource(draft) : undefined;

  const unreadBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) if (!e.read) m.set(e.feedId, (m.get(e.feedId) ?? 0) + 1);
    return m;
  }, [entries]);
  const totalUnread = [...unreadBy.values()].reduce((a, b) => a + b, 0);

  const addFeed = async () => {
    const url = draft?.trim();
    if (!url) return setDraft(null);
    setAdding(true);
    setFeedError(null);
    try {
      const { id, via } = await subscribe(url);
      set({ captureFeed: id });
      setDraft(null);
      setFound(via);
      setTimeout(() => setFound(null), 4000);
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : "Não consegui sintonizar esse endereço.");
    } finally {
      setAdding(false);
    }
  };

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
      <SideSection title="Constelações">
        <SideItem
          icon={<Sparkles size={15} />}
          label="Tudo"
          count={captures.length}
          active={!captureFeed && captureKind === "all"}
          onClick={() => set({ captureKind: "all", captureFeed: null })}
        />
        {(Object.keys(KIND_LABELS) as CaptureKind[])
          .filter((k) => counts.get(k))
          .map((k) => (
            <SideItem
              key={k}
              icon={KIND_ICONS[k]}
              label={KIND_LABELS[k]}
              count={counts.get(k)}
              active={!captureFeed && captureKind === k}
              onClick={() => set({ captureKind: k, captureFeed: null })}
            />
          ))}
      </SideSection>

      <SideSection
        title="Transmissões"
        action={
          <button className="icon-btn side-mini" onClick={() => setDraft("")} title="Seguir um feed RSS">
            <Plus size={13} />
          </button>
        }
      >
        {feeds.length > 0 && (
          <SideItem
            icon={<Radio size={15} />}
            label="Todas"
            count={totalUnread || undefined}
            active={captureFeed === "all"}
            onClick={() => set({ captureFeed: "all" })}
          />
        )}
        {feeds.map((f) => (
          <SideItem
            key={f.id}
            icon={<FeedIcon feed={f} />}
            label={f.title}
            count={unreadBy.get(f.id) || undefined}
            active={captureFeed === f.id}
            onClick={() => set({ captureFeed: f.id })}
            onContextMenu={menu(() => feedMenu(f))}
          >
            {f.error && <span className="feed-dead" title={f.error} />}
          </SideItem>
        ))}
        {draft !== null && (
          <div className="feed-add">
            <input
              className="field side-input"
              autoFocus
              disabled={adding}
              placeholder="URL do site ou do feed"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addFeed();
                if (e.key === "Escape") {
                  setDraft(null);
                  setFeedError(null);
                }
              }}
              onBlur={() => !draft.trim() && !adding && setDraft(null)}
            />
            {hint && !adding && !feedError && (
              <p className="feed-hint mono" data-unsupported={hint.unsupported ? true : undefined}>
                {hint.unsupported ? "✕" : "→"} {hint.label}
              </p>
            )}
            {adding && <p className="side-empty mono">sintonizando…</p>}
            {feedError && <p className="side-empty feed-add-error">{feedError}</p>}
          </div>
        )}
        {found && <p className="feed-hint mono">✦ {found} encontrado</p>}
        {!feeds.length && draft === null && (
          <p className="side-empty">Siga blogs, revistas, canais e podcasts por RSS — o que chega aparece aqui.</p>
        )}
      </SideSection>

      {tags.length > 0 && (
        <SideSection title="Etiquetas">
          {tags.map(([t, n]) => (
            <SideItem
              key={t}
              icon={<Tag size={13} />}
              label={t}
              count={n}
              active={!captureFeed && captureTag === t}
              onClick={() => set({ captureTag: captureTag === t ? null : t, captureFeed: null })}
            />
          ))}
        </SideSection>
      )}

      <div className="side-hint">
        <strong>Capture sem pensar.</strong>
        No campo grande: digite para buscar, ⇥ para perguntar ao acervo, ⇧↵ para guardar. ⌘V em qualquer lugar guarda
        o que estiver copiado.
      </div>
    </>
  );
}
