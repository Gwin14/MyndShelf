import { useState } from "react";

/** Imagem remota com fallback tingido pela matiz do item. */
export function Art({ src, className = "", alt = "", onFail }: { src?: string; className?: string; alt?: string; onFail?: () => void }) {
  const [failed, setFailed] = useState<string>();
  if (!src || failed === src) return <div className={`art art-fallback ${className}`} />;
  return (
    <img
      className={`art ${className}`}
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => {
        setFailed(src);
        onFail?.();
      }}
    />
  );
}
