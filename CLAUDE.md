# Blackmarket Reader

Free Albion Online tools at https://blackmarketreader.com: React 18 + Vite + TypeScript SPA on Vercel
(Hobby plan), Supabase for accounts and the guild data, GitHub Actions for the daily market data.
The user writes German; answer in German, short. Code, comments, commits and UI text are English.

## Hard rules

- **Never push to `main`** unless the user said "auf main pushen" or "auf main releasen" in this
  conversation. Work on `dev`. A hook blocks main pushes; a push the user asked for ends with the
  comment `# user-approved-main`. Earlier approval does not carry over to a later push.
- **Migrations:** the user runs them in the Supabase SQL editor. Write them in `supabase/migrations/`,
  tell the user the file, and do not ship code that needs them before they ran (the Vercel preview
  uses the production database). Never ask for the service role key. The Supabase MCP is for
  read-only checks; ask before anything else.
- **Test account:** only through the env vars `TEST_EMAIL` / `TEST_PASSWORD`, given inline to the
  command. Never write it into a file or a commit.
- **Discord:** the bot token only through `../tools/discord/lib.mjs` (outside this repo); never print
  it or a webhook URL. Changelog posts go to the private tester channel first; the public post only
  after the user approved it.
- Commits end with the `Co-Authored-By` line the session gives.
- Keep the existing design of a tool when changing it.

## Layout

| Path | What |
|---|---|
| `Albion_ProfitChecker/ui/` | the web app (everything below is relative to it) |
| `src/features/<tool>/` | one folder per tool: bm-crafter, crafting-calculator, dashboard, food-potion-crafter, gold-tracker, guild, loot-split, price-checker, refining-calculator |
| `src/pages/` | landing, guides, legal, login, community |
| `src/shared/` | account, region switch, theme, item data, SEO, UI pieces (`@shared/...`) |
| `src/shared/content/toolContent.json` | all guide texts (guide pages are prerendered from it) |
| `api/` | Vercel functions; shared code in `api/_lib/`, tests in `api/_tests/` |
| `api/guild.js` → `api/_lib/guildApi.js` | the guild API, one function, `/api/guild/<action>` |
| `api/_lib/guildStore.js` / `guildMemoryStore.js` | Supabase store / in-memory store (tests, `npm run dev`) |
| `api/billing.js` → `api/_lib/billing.js` | premium via Stripe: `/api/billing/webhook`, `status`, `checkout`, `portal` (env `STRIPE_*`); before the launch only `PREMIUM_TESTERS` (user ids) can buy or use it, `PREMIUM_LAUNCHED=1` opens it; premium features check `hasPremium()` |
| `src/shared/premium/`, `src/pages/PremiumPage.tsx` | premium status, account-panel section, `/premium` page; all hidden until launch (`PREMIUM_OPEN`, preview: `localStorage["bmr-premium-preview"]="1"`). New premium UI goes behind `premiumVisible()`; keep `/premium` out of the sitemap until launch |
| `scripts/` | data refresh jobs, prerender, health check; `scripts/e2e/` browser checks |
| `public/data/`, `public/results-*.js` | market data, refreshed by bots on `main` (never edit by hand) |
| `../../supabase/migrations/` | SQL migrations (run by the user) |
| `../../.github/workflows/` | data refresh, Discord changelog, health check |

Crons (`ui/vercel.json`, production only, Hobby = once a day each): Discord daily, health check,
guild sync + Discord reports (03:30 UTC).
GitHub Actions `guild-zvz.yml` (every 30 min, from `main`): `/api/guild/zvz` posts the ZvZ reports
of Guild Pro (premium), authorized with `ACTIONS_CRON_SECRET` (same value in Vercel and GitHub).

## Commands (in `Albion_ProfitChecker/ui`)

- `npm test` (vitest, ~420 tests), `npx tsc --noEmit -p .` (types only), `npm run build`
  (tsc + vite + prerender of the SEO pages; Vercel runs this, not the tests).
- `npx vite --port 5199 --strictPort`: dev server with the guild API in memory (no database).
- `node scripts/e2e/guild.e2e.mjs` with `E2E_BASE` (default localhost:5199) and the test account
  env vars: every guild tab, guest + signed in, desktop + phone, then the account flows (mark,
  regear tick + marked fight, bank log + split), left as found. `E2E_QUICK=1` for guest/desktop only.
- `graphify query "<question>"` before reading code broadly (see `ui/CLAUDE.md`); the graph updates
  itself after edits (hook).
- `src/features/bm-crafter/hooks/parity.integration.test.ts` checks the committed daily data: when it
  fails right after a data refresh it is the market data, not the code.

## Release (only after "auf main releasen")

1. On `dev`: `git fetch && git merge --no-edit origin/main` (main only has bot data commits), tests,
   build, push `dev`.
2. `git checkout main && git merge --ff-only dev && git push origin main # user-approved-main`,
   back to `dev`.
3. Wait for the Vercel production deployment (`gh api repos/{owner}/{repo}/deployments?sha=...`),
   then the live check: `E2E_BASE=https://blackmarketreader.com node scripts/e2e/guild.e2e.mjs`.
4. Changelog posts are manual only, never automatic: when the user asks, run the "Discord Changelog"
   workflow with target `tester`, and with target `public` only after the user approved that preview.

## Conventions

- Line endings: `.gitattributes` stores LF; whatever an editor writes is normalized on commit. A
  hook warns before a commit that rewrites whole files.
- `CHANGELOG.md`: player-friendly bullets under `## Unreleased`, no emoji.
- Guild data is private per account for now (shared guild-wide data is a later step).
- Albion's killboard (gameinfo API) is unofficial and goes down at times (502, timeouts, a whole
  server for hours): the public guild pages say "Albion's API for <server> is down" and offer the
  other server (`down` in the error answer); it is not our bug.
