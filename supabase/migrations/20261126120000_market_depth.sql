-- Market depth (premium): how much sits on the market at each price, per item and market, from the
-- Albion Data Project's live order stream. Sent every 30 minutes by the GitHub job
-- scripts/market-depth.mjs through /api/market/ingest; players get it through /api/market/depth.
-- Same row and same rules as the live snapshot (RLS on, no policies: service role only).
alter table public.market_live add column if not exists depth jsonb;
alter table public.market_live add column if not exists depth_at timestamptz;
