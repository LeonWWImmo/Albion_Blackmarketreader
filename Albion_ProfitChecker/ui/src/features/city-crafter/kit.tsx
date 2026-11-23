// Shared by the City Crafter and the Focus Planner: city names and crests, number formats, the
// recipe and daily-data loaders and the small setting controls.
import { normalizeRecipesPayload, type BmRecipe } from "../bm-crafter";
import { dailyFromFiles, type DailyPrices } from "./core/books";

export const CREST: Record<string, string> = {
  Bridgewatch: "picture/Bridgewatch.png",
  Caerleon: "picture/Carleon.png",
  "Fort Sterling": "picture/Fortsterlingwappen.png",
  Lymhurst: "picture/Lymhurstwappen.png",
  Martlock: "picture/Martlockwappen.png",
  Thetford: "picture/Thefortwappen.png"
};

/** What each city crafts with its bonus (getBonusCityForItem), for the city cards. */
export const CITY_BONUS: Record<string, string> = {
  Bridgewatch: "Crossbows, daggers, cursed, plate armor, cloth shoes",
  Caerleon: "Gloves, tools, gathering gear",
  "Fort Sterling": "Hammers, spears, holy, plate helmets, cloth armor",
  Lymhurst: "Swords, bows, arcane, leather helmets and shoes",
  Martlock: "Axes, quarterstaffs, frost, off-hands, plate shoes",
  Thetford: "Maces, fire, nature, cloth helmets, leather armor",
  Brecilien: "Bags and capes"
};

export const TIERS = [4, 5, 6, 7, 8];
export const ENCHANTS = [0, 1, 2, 3, 4];
export const ENCHANT_COLOR = ["#94a3b8", "#4ade80", "#60a5fa", "#c084fc", "#fbbf24"];

/** Where the prices come from: live, live filled with daily, or daily. */
export type DataMode = "live" | "fill" | "daily";

export const silver = (n: number) => Math.round(n).toLocaleString("de-DE");
export const short = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}k` : silver(n));
export const age = (minutes: number) =>
  minutes < 60 ? `${Math.max(0, Math.round(minutes))} min` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes / 1440)} d`;
export const nowMinute = () => Math.round(Date.now() / 60000);

let recipesOnce: Promise<BmRecipe[]> | null = null;
export const loadRecipes = () =>
  (recipesOnce ??= fetch("/items-categorized-crafting.json")
    .then((res) => res.json())
    .then((json) => normalizeRecipesPayload(json).items)
    .catch(() => {
      recipesOnce = null;
      return [];
    }));

const dailyOnce = new Map<string, Promise<DailyPrices | null>>();
/** The free tools' daily files of a region (public/data), loaded once. */
export function loadDaily(region: string): Promise<DailyPrices | null> {
  const hit = dailyOnce.get(region);
  if (hit) return hit;
  const get = (file: string) => fetch(`/data/${file}-${region}.json`).then((res) => (res.ok ? res.json() : {}));
  const load = Promise.all([get("crafting-results"), get("materials-cities"), get("artefacts")])
    .then(([results, materials, artefacts]) => dailyFromFiles(results, materials, artefacts))
    .catch(() => {
      dailyOnce.delete(region);
      return null;
    });
  dailyOnce.set(region, load);
  return load;
}

export function Seg<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: Array<[T, string]> }) {
  return (
    <div className="cc-field">
      <span>{label}</span>
      <div className="cc-seg" role="group" aria-label={label}>
        {options.map(([key, text]) => (
          <button key={key} type="button" className={key === value ? "is-on" : ""} aria-pressed={key === value} onClick={() => onChange(key)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Chips({ label, all, on, set, text }: { label: string; all: number[]; on: number[]; set: (v: number[]) => void; text: (n: number) => string }) {
  const toggle = (n: number) => {
    const next = on.includes(n) ? on.filter((x) => x !== n) : [...on, n].sort((a, b) => a - b);
    if (next.length) set(next);
  };
  return (
    <div className="cc-field">
      <span>{label}</span>
      <div className="cc-seg" role="group" aria-label={label}>
        {all.map((n) => (
          <button key={n} type="button" className={on.includes(n) ? "is-on" : ""} aria-pressed={on.includes(n)} onClick={() => toggle(n)}>
            {text(n)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NumberField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="cc-field cc-num">
      <span>{label}</span>
      <input inputMode="numeric" value={String(value)} onChange={(e) => onChange(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))} title={hint} />
    </label>
  );
}
