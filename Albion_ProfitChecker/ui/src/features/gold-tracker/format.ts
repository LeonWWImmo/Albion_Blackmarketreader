/** Number formatting for the Gold Tracker, matching the other tools (12.345 style separators). */

export function formatSilver(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return Math.round(value).toLocaleString("de-DE");
}

/** "+104" / "−38" (true minus sign) / "0". */
export function formatSignedSilver(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toLocaleString("de-DE")}`;
}

/** "+1.24%" / "−0.80%". */
export function formatSignedPct(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return "0.00%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}

/** Gold amounts keep up to two decimals: 1.234,5 gold is a real amount when converting silver. */
export function formatGold(value: number): string {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

/** Parses what a player types: "1.000.000", "1,5m", "250k", "3 750". */
export function parseAmount(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return null;
  const match = /^([\d.,]+)([km]?)$/.exec(text);
  if (!match) return null;
  let digits = match[1];
  const suffix = match[2];
  if (digits.includes(".") && digits.includes(",")) {
    // Both marks, as this page prints amounts ("1.234,56"): dots group thousands, the comma is decimal.
    digits = digits.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+[.,]\d{1,2}$/.test(digits)) {
    // One mark followed by 1-2 digits is a decimal mark ("1,5m", "2.25k").
    digits = digits.replace(",", ".");
  } else {
    // Otherwise the marks group thousands ("1.000.000", "3,750").
    digits = digits.replace(/[.,]/g, "");
  }
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  const factor = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : 1;
  return value * factor;
}
