import type { CSSProperties } from "react";

// The landing page's Premium block, at the very end (the free tools come first): a bento of small
// pictures, one per feature, instead of a list to read. The full story is on /premium.

export function LandingPremium() {
  return (
    <section className="section lp-premium" id="premium" aria-labelledby="lp-premium-title">
      <div className="container lp-premium-in">
        <div className="lp-premium-head">
          <span className="lp-premium-kicker">✦ Premium · optional</span>
          <h2 id="lp-premium-title">Want the live layer?</h2>
          <p>Everything above stays free. Premium adds live prices and a few things that save you time.</p>
        </div>

        <div className="lp-bento">
          <article className="lp-tile is-wide">
            <div className="lp-tile-pic lp-pic-market" aria-hidden="true">
              <span className="lp-live">
                <i /> Live · 12 min ago
              </span>
              {[
                ["Grandmaster's Bow", "Martlock → BM", "+38%"],
                ["Expert's Fire Staff", "Lymhurst → BM", "+26%"],
                ["Master's Cowl", "Bridgewatch → Fort Sterling", "+21%"]
              ].map(([item, route, pct], i) => (
                <div key={item} className="lp-flip" style={{ "--d": `${i * 0.15}s` } as CSSProperties}>
                  <b>{item}</b>
                  <span>{route}</span>
                  <ins>{pct}</ins>
                </div>
              ))}
            </div>
            <h3>Live market</h3>
            <p>Every city and the Black Market, fresh every 30 minutes.</p>
          </article>

          <article className="lp-tile">
            <div className="lp-tile-pic lp-pic-alert" aria-hidden="true">
              <div className="lp-ping">
                <img src="/apple-touch-icon.png" alt="" width={28} height={28} loading="lazy" />
                <span>
                  <small>Blackmarket Reader · now</small>
                  <b>🔔 Buy now: Adept's Bag at 2.140</b>
                </span>
              </div>
            </div>
            <h3>Price alerts</h3>
            <p>Discord pings you when an item hits your price.</p>
          </article>

          <article className="lp-tile">
            <div className="lp-tile-pic lp-pic-guild" aria-hidden="true">
              <div className="lp-score">
                <b>48</b>
                <span>⚔</span>
                <b className="is-d">19</b>
              </div>
              <div className="lp-kd">
                {Array.from({ length: 10 }, (_, i) => (
                  <i key={i} className={i < 7 ? "is-k" : ""} />
                ))}
              </div>
              <small>👑 MVP Moonveil · 9 kills</small>
            </div>
            <h3>Guild Pro</h3>
            <p>A ZvZ report in Discord after every big fight.</p>
          </article>

          <article className="lp-tile">
            <div className="lp-tile-pic lp-pic-city" aria-hidden="true">
              {[
                ["Lymhurst", 100, "25.7m"],
                ["Fort Sterling", 45, "11.6m"],
                ["Bridgewatch", 23, "5.8m"]
              ].map(([city, fill, daily], i) => (
                <div key={city} className={`lp-bar${i === 0 ? " is-top" : ""}`} style={{ "--fill": `${fill}%`, "--d": `${i * 0.15}s` } as CSSProperties}>
                  <span>{city}</span>
                  <i />
                  <b>{daily}</b>
                </div>
              ))}
            </div>
            <h3>City Crafter</h3>
            <p>Buy, craft and sell in one city. No transport.</p>
          </article>

          <article className="lp-tile is-wide">
            <div className="lp-tile-pic lp-pic-focus" aria-hidden="true">
              <div className="lp-focus-line">
                <span>
                  <b>10.000</b> focus
                </span>
                <i>→</i>
                <strong>+850.424</strong>
                <span>silver</span>
              </div>
              <div className="lp-focus-bar">
                <i style={{ "--w": "46%" } as CSSProperties} />
                <i style={{ "--w": "31%" } as CSSProperties} />
                <i style={{ "--w": "23%" } as CSSProperties} />
              </div>
              <small>With your specs from the Crafting Calculator</small>
            </div>
            <h3>Focus Planner</h3>
            <p>Where your daily focus earns the most silver.</p>
          </article>

          <article className="lp-tile">
            <div className="lp-tile-pic lp-pic-craft" aria-hidden="true">
              {[
                ["Planks", "1.218", true],
                ["Metal Bar", "2.480", true],
                ["Artefact", "9.900", false]
              ].map(([name, value, live]) => (
                <div key={String(name)} className="lp-price">
                  <span>{name}</span>
                  <b>
                    {value} <i className={live ? "is-live" : ""} />
                  </b>
                </div>
              ))}
            </div>
            <h3>Live crafting</h3>
            <p>All four calculators on live prices.</p>
          </article>
        </div>

        <a className="lp-premium-more" href="/premium">
          See what Premium adds <span aria-hidden="true">→</span>
        </a>
      </div>
    </section>
  );
}
