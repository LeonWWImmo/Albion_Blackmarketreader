-- Live market (premium): the latest snapshot of every dashboard item's prices per region, sent
-- every 30 minutes by the GitHub job scripts/market-live.mjs through /api/market/ingest.
-- Only the server reads and writes it (service role): RLS on and no policies, so the anon and
-- authenticated roles see nothing. Players get it through /api/market/live, premium only.
create table if not exists public.market_live (
  region text primary key check (region in ('eu', 'us')),
  prices jsonb,
  prices_at timestamptz,
  volume jsonb,
  volume_at timestamptz
);

alter table public.market_live enable row level security;
revoke all on public.market_live from anon, authenticated;
