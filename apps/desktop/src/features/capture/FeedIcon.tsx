import { useState, type CSSProperties } from "react";
import { hostOf } from "@myndshelf/core";
import type { Feed } from "@myndshelf/types";

/** Ícone do feed: o do próprio feed, o favicon do site ou um planeta na cor dele. */
export function FeedIcon({ feed }: { feed: Feed }) {
  const host = hostOf(feed.siteUrl ?? feed.url);
  const candidates = [feed.icon, host && `https://${host}/favicon.ico`].filter(Boolean) as string[];
  const [i, setI] = useState(0);
  if (i >= candidates.length) return <span className="planet" style={{ "--hue": feed.hue } as CSSProperties} />;
  return (
    <img
      className="feed-icon"
      src={candidates[i]}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setI((n) => n + 1)}
    />
  );
}
