import { BookOpen, Expand, MapPin, MessageCircle, Play } from "lucide-react";
import { VIEW_LABELS, viewModeOf, type ViewMode } from "@myndshelf/core";
import type { CaptureItem } from "@myndshelf/types";
import { useGlow } from "../../lib/ai";
import { menu } from "../../lib/contextMenu";
import { captureMenu } from "../../lib/menus";
import { Cover, SELF_CAPTIONED } from "./covers/Cover";

const VIEW_ICONS: Record<ViewMode, React.JSX.Element> = {
  play: <Play size={11} fill="currentColor" />,
  read: <BookOpen size={11} />,
  image: <Expand size={11} />,
  map: <MapPin size={11} />,
  post: <MessageCircle size={11} />,
};

export function CaptureCard({
  item,
  index,
  onOpen,
  onView,
}: {
  item: CaptureItem;
  index: number;
  onOpen: () => void;
  onView: () => void;
}) {
  const mode = item.status === "ready" ? viewModeOf(item) : undefined;
  const working = useGlow((s) => !!s.working[item.id]);
  const glow = useGlow((s) => !!s.fresh[`${item.id}:card`]);
  return (
    <article
      className="card"
      data-kind={item.kind}
      data-working={working || undefined}
      data-glow={glow || undefined}
      style={{ animationDelay: `${Math.min(index, 16) * 35}ms` }}
      onClick={onOpen}
      onContextMenu={menu(() => captureMenu(item))}
    >
      {mode && (
        <button
          className="card-open"
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
        >
          {VIEW_ICONS[mode]} {VIEW_LABELS[mode]}
        </button>
      )}
      <Cover item={item} />
      {!SELF_CAPTIONED.has(item.kind) && item.status !== "loading" && (
        <footer className="card-cap">
          <h3 className="card-title">{item.title}</h3>
          <p className="card-meta mono">
            {item.favicon && (
              <img src={item.favicon} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
            )}
            <span>{item.author && item.kind !== "link" ? item.author : item.siteName}</span>
          </p>
        </footer>
      )}
    </article>
  );
}
