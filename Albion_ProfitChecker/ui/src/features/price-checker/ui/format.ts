/** 12345 -> "12.345", the number style every tool on the site uses. */
export const silver = (value: number) => Math.round(value).toLocaleString("de-DE");

/** 12345678 -> "12.3m", 45600 -> "45.6k", 950 -> "950": for axes and tight spaces. */
export function shortPrice(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}m`;
  if (abs >= 1e4) return `${(value / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}k`;
  return silver(value);
}

/** 0.124 -> "+12.4%" */
export const signedPercent = (fraction: number) => `${fraction >= 0 ? "+" : "−"}${Math.abs(fraction * 100).toFixed(Math.abs(fraction) >= 0.1 ? 0 : 1)}%`;
