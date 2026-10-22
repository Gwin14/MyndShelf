import { useState } from "react";

/** Imagem remota com fallback tingido pela matiz do item. */
export function Art({ src, className = "", alt = "" }: { src?: string; className?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={`art art-fallback ${className}`} />;
  return (
    <img
      className={`art ${className}`}
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
