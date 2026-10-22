export function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Matiz estável derivada de uma string — dá cor própria a cada item. */
export function hueFrom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function relativeDate(ts: number, now = Date.now()): string {
  const d = Math.round((now - ts) / 86_400_000);
  if (d <= 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
