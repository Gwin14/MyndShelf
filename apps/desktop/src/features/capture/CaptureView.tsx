import { useEffect, useMemo, useState } from "react";
import { coverHeight, KIND_LABELS } from "@myndshelf/core";
import { Headline } from "../../components/Headline";
import { Masonry } from "../../components/Masonry";
import { captureImageFile, captureText } from "../../lib/capture";
import { useLibrary } from "../../lib/store";
import { useUi } from "../../lib/ui";
import { AddBar } from "./AddBar";
import { CaptureCard } from "./CaptureCard";
import { FeedView } from "./FeedView";
import { LibraryAnswer } from "./LibraryAnswer";

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function CaptureView() {
  const captures = useLibrary((s) => s.captures);
  const { captureKind, captureTag, captureQuery, captureFeed, set } = useUi();
  const [dragging, setDragging] = useState(false);
  const nativeDrag = useUi((s) => s.nativeDrag);
  const libraryQuestion = useUi((s) => s.libraryQuestion);

  const items = useMemo(() => {
    const q = captureQuery.trim().toLowerCase();
    return captures.filter(
      (c) =>
        (captureKind === "all" || c.kind === captureKind) &&
        (!captureTag || c.tags.includes(captureTag)) &&
        (!q || [c.title, c.description, c.note, c.siteName, c.author, ...c.tags].some((t) => t?.toLowerCase().includes(q))),
    );
  }, [captures, captureKind, captureTag, captureQuery]);

  // colar em qualquer lugar da seção
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) files.forEach((f) => void captureImageFile(f));
      else {
        const text = e.clipboardData?.getData("text");
        if (text) void captureText(text);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  if (captureFeed) return <FeedView feedId={captureFeed} />;

  const filterLabel = captureKind === "all" ? "referências" : KIND_LABELS[captureKind].toLowerCase();

  return (
    <div
      className="stage-pad"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes("text/uri-list")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
        if (files.length) return files.forEach((f) => void captureImageFile(f));
        const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text");
        if (url) void captureText(url);
      }}
    >
      <Headline kicker={`I — Captura · ${items.length} ${filterLabel}`}>
        Tudo o que <em>te</em> atravessa.
      </Headline>

      <AddBar />

      {libraryQuestion && <LibraryAnswer key={libraryQuestion.n} question={libraryQuestion.q} />}

      {items.length ? (
        <Masonry
          items={items}
          minColumnWidth={228}
          gap={26}
          estimate={coverHeight}
          getKey={(item) => item.id}
          render={(item, i) => (
            <CaptureCard
              item={item}
              index={i}
              onOpen={() => set({ openCaptureId: item.id })}
              onView={() => set({ viewerCaptureId: item.id })}
            />
          )}
        />
      ) : captureQuery.trim() ? (
        <div className="empty">
          <div className="empty-orbit" />
          <p className="empty-title">Nada no céu com “{captureQuery.trim().slice(0, 40)}”.</p>
          <p>⇥ para perguntar ao acervo · ⇧↵ para guardar como nota</p>
        </div>
      ) : (
        <div className="empty">
          <div className="empty-orbit" />
          <p className="empty-title">O céu ainda está quieto.</p>
          <p>Cole um link, arraste uma imagem ou escreva algo acima.</p>
        </div>
      )}

      {(dragging || nativeDrag) && <div className="drop-veil">Solte para guardar ✦</div>}
    </div>
  );
}
