/**
 * MyndShelf — Vintage Cosmic Dreamscape.
 * Fonte única de verdade para cores, tipografia e ritmo; cada plataforma
 * converte para o seu formato (CSS vars no desktop/web, StyleSheet no RN).
 */
export const colors = {
  void: "#06050b",
  night: "#0c0a15",
  nebula: "#151229",
  dusk: "#1f1a38",
  paper: "#efe6d2",
  paperDim: "#bcb3a1",
  paperMute: "#7a7468",
  line: "rgba(239, 230, 210, 0.12)",
  /* labareda solar — das referências */
  cobalt: "#2a4bff",
  cyan: "#6fd6ff",
  sun: "#fff1b8",
  amber: "#ffb43d",
  ember: "#ff5a24",
  magenta: "#d42a6a",
} as const;

export const gradients = {
  flare: `linear-gradient(100deg, ${colors.cobalt} 0%, ${colors.cyan} 18%, ${colors.sun} 38%, ${colors.amber} 55%, ${colors.ember} 74%, ${colors.magenta} 100%)`,
  beam: `radial-gradient(60% 80% at 50% 100%, rgba(111, 214, 255, 0.35), rgba(42, 75, 255, 0.08) 55%, transparent 75%)`,
} as const;

export const fonts = {
  display: `"Instrument Serif", "Times New Roman", serif`,
  body: `"Inter Tight Variable", "Inter Tight", system-ui, sans-serif`,
  mono: `"Space Mono", ui-monospace, monospace`,
} as const;

export const radii = { sm: 4, md: 10, lg: 18, pill: 999 } as const;
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const;
export const motion = {
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  fast: 160,
  base: 280,
  slow: 600,
} as const;

export const tokens = { colors, gradients, fonts, radii, space, motion } as const;
export type Tokens = typeof tokens;
