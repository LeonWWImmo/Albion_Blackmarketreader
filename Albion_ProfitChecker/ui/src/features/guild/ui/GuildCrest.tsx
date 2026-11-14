/**
 * A guild's shield. Albion's API has no guild heraldry (its `Logo` is always empty), so every guild
 * gets its own colours from its id: the same guild always looks the same, on every page.
 */
export function crestColors(id: string): { from: string; to: string } {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return { from: `hsl(${hue} 62% 52%)`, to: `hsl(${(hue + 40) % 360} 58% 26%)` };
}

export function GuildCrest({ id, name, size = 64 }: { id: string; name: string; size?: number }) {
  const { from, to } = crestColors(id);
  // every character kept, so two ids that differ only in "-" or "_" never share a gradient
  const gradient = `crest-${id.replace(/[^A-Za-z0-9]/g, (ch) => `x${ch.charCodeAt(0)}`)}`;
  return (
    <svg className="gd-crest" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${name} crest`}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <path d="M32 3 56 11v20c0 15-10 25-24 30C18 56 8 46 8 31V11Z" fill={`url(#${gradient})`} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      <path d="M32 9 50 15v16c0 11-7 19-18 23-11-4-18-12-18-23V15Z" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      <text x="32" y="38" textAnchor="middle" fontSize="22" fontWeight="800" fill="#fff" fontFamily="inherit">
        {(name.trim()[0] ?? "?").toUpperCase()}
      </text>
    </svg>
  );
}
