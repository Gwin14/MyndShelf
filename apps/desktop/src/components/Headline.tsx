import type { ReactNode } from "react";

/** Título editorial das seções — serif grande com uma palavra em itálico. */
export function Headline({ kicker, children, aside }: { kicker: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="headline">
      <div>
        <p className="kicker">{kicker}</p>
        <h1 className="headline-title">{children}</h1>
      </div>
      {aside && <div className="headline-aside">{aside}</div>}
    </div>
  );
}
