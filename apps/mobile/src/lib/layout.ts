import { useWindowDimensions } from "react-native";

export const GUTTER = 16;

/** Celular: 2 colunas; tablet: 3–5 — a mesma conta do mural do desktop (coluna mínima). */
export function useColumns(min = 160, gap = 14) {
  const { width } = useWindowDimensions();
  const inner = Math.min(width, 1400) - GUTTER * 2;
  const columns = Math.max(2, Math.min(5, Math.floor((inner + gap) / (min + gap))));
  const colWidth = (inner - gap * (columns - 1)) / columns;
  return { columns, colWidth, gap, width, isTablet: width >= 700 };
}
