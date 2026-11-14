/**
 * A guild's coat of arms. Albion's API has no guild heraldry (its `Logo` is always empty), so every
 * guild gets its own from its id: two colours and one of a few heraldic patterns, the same guild
 * always the same, on every page.
 */
export function crestColors(id: string): { from: string; to: string; pattern: number } {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return { from: `hsl(${hue} 62% 52%)`, to: `hsl(${(hue + 40) % 360} 58% 26%)`, pattern: Math.floor(hash / 360) % PATTERNS.length };
}

const SHIELD = "M32 3 56 11v20c0 15-10 25-24 30C18 56 8 46 8 31V11Z";
/** Chevron, bend, cross, pale: drawn in the shield's light colour. */
const PATTERNS = ["M8 40 32 22l24 18v9L32 31 8 49Z", "M8 11h7l41 41v-9L15 3H8Z", "M28 3h8v58h-8ZM8 25h48v8H8Z", "M24 3h16v58H24Z"];

export function GuildCrest({ id, name, size = 64, className = "" }: { id: string; name: string; size?: number; className?: string }) {
  const { from, to, pattern } = crestColors(id);
  // every character kept, so two ids that differ only in "-" or "_" never share a gradient
  const key = id.replace(/[^A-Za-z0-9]/g, (ch) => `x${ch.charCodeAt(0)}`);
  return (
    <svg className={`gd-crest ${className}`.trim()} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${name} coat of arms`}>
      <defs>
        <linearGradient id={`crest-${key}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <clipPath id={`crest-clip-${key}`}>
          <path d={SHIELD} />
        </clipPath>
      </defs>
      <path d={SHIELD} fill={`url(#crest-${key})`} />
      <path d={PATTERNS[pattern]} fill="rgba(255,255,255,0.22)" clipPath={`url(#crest-clip-${key})`} />
      <path d={SHIELD} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
    </svg>
  );
}
