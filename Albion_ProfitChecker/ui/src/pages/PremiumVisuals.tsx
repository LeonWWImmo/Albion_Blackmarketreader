// The pictures of /premium (PremiumPage.tsx): what each premium feature looks like, drawn in HTML/SVG
// with made-up example data (marked "Example" on the page), no screenshots to keep up to date.

/** The ZvZ report as it lands in Discord: the same fields api/_lib/guildDiscord.js zvzReport posts. */
export function DiscordZvzMock() {
  const fields: Array<[string, string]> = [
    ["🗡️ Kills", "48"],
    ["💀 Deaths", "19"],
    ["⚖️ K/D", "2.53"],
    ["⭐ Kill fame", "38.2m"],
    ["💰 Regear", "61.4m silver"],
    ["🟢 Result", "Won"]
  ];
  const tops: Array<[string, string[]]> = [
    ["🔥 Top damage", ["🥇 Kaelthar · 412k", "🥈 Moonveil · 388k", "🥉 Brakka · 301k"]],
    ["🏆 Top kill fame", ["🥇 Moonveil · 6.1m", "🥈 Kaelthar · 4.8m", "🥉 Sirelle · 3.9m"]],
    ["💚 Top support", ["🥇 Sirelle · 31 healed", "🥈 Thornbe · 24 healed", "🥉 Ivo · 17 healed"]]
  ];
  return (
    <div className="pv-discord" aria-hidden="true">
      <div className="pv-msg">
        <img className="pv-avatar" src="/apple-touch-icon.png" alt="" width={40} height={40} />
        <div className="pv-msg-body">
          <div className="pv-msg-head">
            <b>Blackmarket Reader</b>
            <span className="pv-app">APP</span>
            <span className="pv-time">Today at 21:47</span>
          </div>
          <div className="pv-embed">
            <span className="pv-embed-author">Blackmarket Reader · Guild tools</span>
            <span className="pv-embed-title">⚔️ Won · [FUZ] Angry Fuzzies</span>
            <span className="pv-embed-line">🕒 Today 21:12 · 23 min · Europe</span>
            <span className="pv-embed-line">
              👥 <b>34</b> of ours · 112 players in the fight
            </span>
            <span className="pv-embed-line">🆚 [NOX] 41 · [VEIL] 22 · Bandits 9</span>
            <div className="pv-fields">
              {fields.map(([name, value]) => (
                <div key={name}>
                  <span>{name}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>
            <div className="pv-fields pv-fields-top">
              {tops.map(([name, rows]) => (
                <div key={name}>
                  <span>{name}</span>
                  {rows.map((r) => (
                    <small key={r}>{r}</small>
                  ))}
                </div>
              ))}
            </div>
            <span className="pv-embed-links">Battle report · Regear · Attendance</span>
            <span className="pv-embed-foot">ZvZ report · Guild Pro · blackmarketreader.com</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 90 days of attendance as a heat strip: who showed up to the fights. */
export function AttendanceMock() {
  const names = ["Kaelthar", "Moonveil", "Sirelle", "Brakka", "Thornbe"];
  // a fixed pattern, so the picture is the same on every visit
  const level = (row: number, col: number) => ((row * 7 + col * 13 + ((col * col) % 5)) % 9) % 4;
  return (
    <div className="pv-attend" aria-hidden="true">
      {names.map((name, row) => (
        <div className="pv-attend-row" key={name}>
          <span>{name}</span>
          <div className="pv-attend-cells">
            {Array.from({ length: 26 }, (_, col) => (
              <i key={col} className={`l${row === 4 && col > 16 ? 0 : level(row, col)}`} />
            ))}
          </div>
        </div>
      ))}
      <div className="pv-attend-foot">
        <span>90 days</span>
        <span>
          less <i className="l0" />
          <i className="l1" />
          <i className="l2" />
          <i className="l3" /> more
        </span>
      </div>
    </div>
  );
}

/** A price alert arriving as a Discord message. */
export function AlertMock() {
  return (
    <div className="pv-alerts" aria-hidden="true">
      <div className="pv-alert">
        <span className="pv-alert-icon">🔔</span>
        <div>
          <b>Adept's Bag dropped to 21.4k</b>
          <small>Martlock · your price 22k · 3 min ago</small>
        </div>
      </div>
      <div className="pv-alert is-second">
        <span className="pv-alert-icon">💰</span>
        <div>
          <b>Black Market craft at +31%</b>
          <small>Expert's Mercenary Jacket · Caerleon</small>
        </div>
      </div>
    </div>
  );
}

/** What the Black Market pays against the cities. */
export function ResellMock() {
  const rows: Array<[string, string, string, string]> = [
    ["Grandmaster's Bow", "182k", "251k", "+38%"],
    ["Adept's Plate Helmet", "41k", "55k", "+34%"],
    ["Expert's Fire Staff", "96k", "121k", "+26%"]
  ];
  return (
    <div className="pv-table" aria-hidden="true">
      <div className="pv-table-head">
        <span>Item</span>
        <span>City</span>
        <span>BM pays</span>
        <span>Profit</span>
      </div>
      {rows.map(([item, city, bm, profit]) => (
        <div className="pv-table-row" key={item}>
          <span>{item}</span>
          <span>{city}</span>
          <span>{bm}</span>
          <b>{profit}</b>
        </div>
      ))}
    </div>
  );
}

/** A price line climbing, with its trend chip. */
export function TrendMock() {
  const points = [62, 58, 64, 60, 55, 57, 50, 52, 46, 48, 41, 38, 42, 34, 30, 26];
  const path = points.map((y, i) => `${i === 0 ? "M" : "L"}${(i / (points.length - 1)) * 300},${y}`).join(" ");
  return (
    <div className="pv-trend" aria-hidden="true">
      <span className="pv-trend-chip">▲ 18% this week</span>
      <svg viewBox="0 0 300 80" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pv-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f5c96a" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f5c96a" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L300,80 L0,80 Z`} fill="url(#pv-trend-fill)" />
        <path d={path} fill="none" stroke="#f5c96a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
