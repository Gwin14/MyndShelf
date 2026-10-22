import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Mural em colunas feito com flexbox. CSS `columns` no WebKit (o webview do Tauri)
 * faz cards com transform/animação sumirem e deixa buracos no topo das colunas.
 * Aqui cada item vai para a coluna mais baixa, usando uma altura estimada —
 * a distribuição é estável e não muda quando o mouse passa por cima.
 */
export function Masonry<T>({
  items,
  minColumnWidth,
  gap,
  estimate,
  render,
  getKey,
}: {
  items: T[];
  minColumnWidth: number;
  gap: number;
  /** altura aproximada do item, em proporção da largura da coluna */
  estimate: (item: T) => number;
  render: (item: T, index: number) => ReactNode;
  getKey: (item: T) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const count = Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap)));

  const columns = useMemo(() => {
    const cols: { item: T; index: number }[][] = Array.from({ length: count }, () => []);
    const heights = new Array(count).fill(0);
    items.forEach((item, index) => {
      const shortest = heights.indexOf(Math.min(...heights));
      cols[shortest].push({ item, index });
      heights[shortest] += estimate(item) + 0.12;
    });
    return cols;
  }, [items, count, estimate]);

  return (
    <div ref={ref} className="masonry" style={{ gap }}>
      {width > 0 &&
        columns.map((col, i) => (
          <div key={i} className="masonry-col" style={{ gap }}>
            {col.map(({ item, index }) => (
              <div key={getKey(item)} className="masonry-cell">
                {render(item, index)}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
