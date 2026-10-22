import { useEffect, useMemo, useState } from "react";
import { KIND_LABELS } from "@myndshelf/core";
import { Headline } from "../../components/Headline";
import { captureImageFile, captureText } from "../../lib/capture";
import { useLibrary } from "../../lib/store";
import { useUi } from "../../lib/ui";
import { AddBar } from "./AddBar";
import { CaptureCard } from "./CaptureCard";
import { CaptureDetail } from "./CaptureDetail";

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

export function CaptureView() {
  const captures = useLibrary((s) => s.captures);
  const { captureKind, captureTag, captureQuery, openCaptureId, set } = useUi();
  const [dragging, setDragging] = useState(false);

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

      {items.length ? (
        <div className="masonry">
          {items.map((item, i) => (
            <CaptureCard key={item.id} item={item} index={i} onOpen={() => set({ openCaptureId: item.id })} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <div className="empty-orbit" />
          <p className="empty-title">O céu ainda está quieto.</p>
          <p>Cole um link, arraste uma imagem ou escreva algo acima.</p>
        </div>
      )}

      {dragging && <div className="drop-veil">Solte para guardar ✦</div>}
      {openCaptureId && <CaptureDetail id={openCaptureId} onClose={() => set({ openCaptureId: null })} />}
    </div>
  );
}
