/** Opens the public #📊-price-coverage channel, where the daily check posts the same numbers. */
export const COVERAGE_DISCORD = "https://discord.gg/HtD2wJaMSj";

export type CityCoverage = { city: string; percent: number };
export type CoverageLevel = "good" | "thin" | "poor";
type CitiesFile = { generatedAt?: string; cities?: string[]; items?: { prices?: Record<string, number | null | undefined> }[] };

/** Share (0-100) of the materials with a price in each city, as the daily health check counts it. */
export function cityCoverage(data: CitiesFile): CityCoverage[] {
  const items = data.items ?? [];
  return (data.cities ?? []).map((city) => ({
    city,
    percent: items.length ? (items.filter((item) => (item.prices?.[city] ?? 0) > 0).length / items.length) * 100 : 0
  }));
}

/** Same colours as the health check: 80 % and 50 %; Brecilien has few traders, so half of that. */
export function coverageLevel(city: string, percent: number): CoverageLevel {
  const factor = city === "Brecilien" ? 0.5 : 1;
  return percent >= 80 * factor ? "good" : percent >= 50 * factor ? "thin" : "poor";
}

/** "5 min", "21 h", "3 d" */
export function ageText(ms: number): string {
  const hour = 36e5;
  if (ms < hour) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (ms < 48 * hour) return `${Math.round(ms / hour)} h`;
  return `${Math.round(ms / (24 * hour))} d`;
}

export type RegionCoverage = { cities: CityCoverage[]; generatedAt: string | null };

const cache = new Map<string, Promise<RegionCoverage>>();

/** The coverage of one server, loaded once per page view. */
export function loadCoverage(region: "eu" | "us"): Promise<RegionCoverage> {
  let pending = cache.get(region);
  if (!pending) {
    pending = fetch(`/data/materials-cities-${region}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CitiesFile>;
      })
      .then((data) => ({ cities: cityCoverage(data), generatedAt: data.generatedAt ?? null }));
    // a failed load is tried again the next time the panel opens
    pending.catch(() => cache.delete(region));
    cache.set(region, pending);
  }
  return pending;
}
