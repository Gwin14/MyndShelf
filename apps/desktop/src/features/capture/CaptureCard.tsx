import type { CaptureItem } from "@myndshelf/types";
import { Cover, SELF_CAPTIONED } from "./covers/Cover";

export function CaptureCard({ item, index, onOpen }: { item: CaptureItem; index: number; onOpen: () => void }) {
  return (
    <article
      className="card"
      data-kind={item.kind}
      style={{ animationDelay: `${Math.min(index, 16) * 35}ms` }}
      onClick={onOpen}
    >
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
