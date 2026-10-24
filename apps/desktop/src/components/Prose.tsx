import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { openExternal } from "../lib/platform";

export interface ProseRef {
  label: string;
  hue?: number;
  open(): void;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function render(block: string, resolve?: (key: string) => ProseRef | undefined): string {
  // [[c3]] passa pelo markdown como marcador e só depois vira o botão do item
  const marked_ = block.replace(/\[\[([\w-]+)\]\]/g, "⟦$1⟧");
  const html = DOMPurify.sanitize(marked.parse(marked_, { async: false, gfm: true }), { FORBID_TAGS: ["style", "img", "iframe", "form"], FORBID_ATTR: ["style"] });
  return html.replace(/⟦([\w-]+)⟧/g, (_, key: string) => {
    const ref = resolve?.(key);
    return ref ? `<button class="ref" data-ref="${esc(key)}" style="--hue:${ref.hue ?? 38}">${esc(ref.label)}</button>` : "";
  });
}

/**
 * A rede entrega o texto aos trancos; aqui ele escorre a um ritmo contínuo,
 * mais rápido quando há muito acumulado, para nunca ficar para trás.
 */
function useFlowingText(target: string, live: boolean) {
  const [shown, setShown] = useState(live ? "" : target);
  const pos = useRef(shown.length);

  useEffect(() => {
    if (!live) {
      pos.current = target.length;
      setShown(target);
      return;
    }
    let raf = 0;
    const tick = () => {
      const backlog = target.length - pos.current;
      if (backlog <= 0) return;
      pos.current += Math.max(1, Math.ceil(backlog / 12));
      setShown(target.slice(0, pos.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, live]);

  return shown;
}

/**
 * Texto gerado. Cada parágrafo é um elemento próprio: os que já estavam
 * na tela ficam parados e só os novos entram. Quando termina de escrever,
 * uma luz passa por cima uma vez.
 */
export function Prose({
  text,
  streaming,
  resolve,
}: {
  text: string;
  streaming?: boolean;
  resolve?: (key: string) => ProseRef | undefined;
}) {
  // quem começou escrevendo continua escorrendo até o fim, mesmo depois que a rede termina
  const live = useRef(!!streaming).current;
  const shown = useFlowingText(text, live);
  const writing = live && (streaming || shown.length < text.length);

  const blocks = useMemo(() => {
    // referência pela metade ("[[c1") espera o resto chegar; negrito aberto já fecha
    let ready = writing ? shown.replace(/\[\[[^\]]*\]?$/, "").replace(/\*$/, "") : shown;
    if (writing && (ready.match(/\*\*/g)?.length ?? 0) % 2) ready += "**";
    return ready
      .split(/\n{2,}/)
      .filter((b) => b.trim())
      .map((b) => render(b, resolve));
  }, [shown, writing, resolve]);

  const onClick = (e: MouseEvent) => {
    const el = e.target as HTMLElement;
    const ref = el.closest<HTMLElement>("[data-ref]");
    if (ref) return resolve?.(ref.dataset.ref!)?.open();
    const a = el.closest("a");
    if (a) {
      e.preventDefault();
      if (/^https?:/.test(a.href)) void openExternal(a.href);
    }
  };

  return (
    <div className="prose" data-writing={writing || undefined} data-settled={(live && !writing) || undefined} onClick={onClick}>
      {blocks.map((html, i) => (
        <div key={i} className="prose-block" dangerouslySetInnerHTML={{ __html: html }} />
      ))}
    </div>
  );
}

/** Acompanha a altura do conteúdo com transição: nada aparece ou some aos pulos. */
export function Smooth({ children, className }: { children: ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const o = outer.current!;
    const i = inner.current!;
    const fit = () => (o.style.height = `${i.offsetHeight}px`);
    const ro = new ResizeObserver(fit);
    ro.observe(i);
    fit();
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className={`smooth ${className ?? ""}`}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
