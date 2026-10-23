import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight } from "lucide-react";
import { useContextMenu, type MenuEntry } from "../lib/contextMenu";

type Item = Extract<MenuEntry, { label: string }>;
const isItem = (e: MenuEntry): e is Item => "label" in e;

/** Menu de clique direito do app: estilo do céu, submenus e teclado. */
export function ContextMenu() {
  const menu = useContextMenu((s) => s.menu);
  const close = useContextMenu((s) => s.close);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".ctx")) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("wheel", close);
    };
  }, [menu, close]);

  if (!menu) return null;
  return createPortal(<Panel key={`${menu.x}:${menu.y}`} entries={menu.entries} x={menu.x} y={menu.y} root onDone={close} />, document.body);
}

function Panel({
  entries,
  x,
  y,
  root,
  flipLeftFrom,
  onDone,
  onBack,
}: {
  entries: MenuEntry[];
  x: number;
  y: number;
  root?: boolean;
  /** submenus: se não couber à direita, abre à esquerda deste x */
  flipLeftFrom?: number;
  onDone(): void;
  onBack?(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, origin: "0 0" });
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<{ index: number; x: number; y: number; flip: number } | null>(null);

  // cabe na tela: vira para a esquerda/para cima quando precisa
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    let left = x;
    let top = y;
    let ox = "0";
    let oy = "0";
    if (left + r.width > window.innerWidth - 8) {
      left = flipLeftFrom != null ? flipLeftFrom - r.width : x - r.width;
      ox = "100%";
    }
    if (top + r.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - r.height - 8);
      oy = "100%";
    }
    setPos({ left: Math.max(8, left), top, origin: `${ox} ${oy}` });
  }, [x, y, flipLeftFrom]);

  useEffect(() => ref.current?.focus(), []);

  const openSub = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setSub({ index: i, x: r.right - 4, y: r.top - 6, flip: r.left + 4 });
  };

  const run = (e: Item) => {
    if (e.disabled || e.children) return;
    onDone();
    e.onSelect?.();
  };

  const onKey = (ev: React.KeyboardEvent) => {
    const items = entries.map((e, i) => [e, i] as const).filter(([e]) => isItem(e) && !e.disabled);
    const pos = items.findIndex(([, i]) => i === active);
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const next = items[(pos + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
      if (next) setActive(next[1]);
    } else if (ev.key === "Enter" || ev.key === "ArrowRight") {
      const e = entries[active];
      if (!e || !isItem(e)) return;
      ev.preventDefault();
      if (e.children) {
        const el = ref.current!.querySelector<HTMLElement>(`[data-index="${active}"]`);
        if (el) openSub(active, el);
      } else if (ev.key === "Enter") run(e);
    } else if (ev.key === "ArrowLeft" && onBack) {
      ev.preventDefault();
      onBack();
    }
  };

  const subEntry = sub ? entries[sub.index] : undefined;

  return (
    <>
      <div
        ref={ref}
        className={`ctx ${root ? "ctx-root" : "ctx-sub"}`}
        style={{ left: pos.left, top: pos.top, transformOrigin: pos.origin }}
        role="menu"
        tabIndex={-1}
        onKeyDown={onKey}
        onContextMenu={(e) => e.preventDefault()}
      >
        {entries.map((e, i) => {
          if ("separator" in e) return <div key={i} className="ctx-sep" />;
          if ("heading" in e) return <div key={i} className="ctx-heading mono">{e.heading}</div>;
          return (
            <button
              key={i}
              data-index={i}
              className="ctx-item"
              role="menuitem"
              data-active={active === i || sub?.index === i || undefined}
              data-danger={e.danger || undefined}
              disabled={e.disabled}
              onPointerEnter={(ev) => {
                setActive(i);
                if (e.children) openSub(i, ev.currentTarget);
                else setSub(null);
              }}
              onClick={(ev) => (e.children ? openSub(i, ev.currentTarget) : run(e))}
            >
              <span className="ctx-icon">{e.checked ? <Check size={13} /> : e.icon}</span>
              <span className="ctx-label">{e.label}</span>
              {e.hint && <span className="ctx-hint mono">{e.hint}</span>}
              {e.children && <ChevronRight size={13} className="ctx-chevron" />}
            </button>
          );
        })}
      </div>
      {sub && subEntry && isItem(subEntry) && subEntry.children && (
        <Panel
          key={sub.index}
          entries={subEntry.children}
          x={sub.x}
          y={sub.y}
          flipLeftFrom={sub.flip}
          onDone={onDone}
          onBack={() => {
            setSub(null);
            ref.current?.focus();
          }}
        />
      )}
    </>
  );
}
