-- 1. Live market: the snapshot parts are stored gzipped (base64 text) instead of jsonb. Every warm
--    Vercel function reads a fresh snapshot every 30 minutes; gzipped that moves about a quarter
--    of the bytes out of Supabase (egress). The table only ever holds two rows (eu, us), each
--    overwritten by the next snapshot, so the old columns are dropped, not converted.
--    Also drops the market depth columns (the feature was removed).
-- 2. profiles: the read policy asks auth.uid() once per query, not once per row (Supabase advisor
--    "auth_rls_initplan").

alter table public.market_live
  drop column if exists prices,
  drop column if exists volume,
  drop column if exists depth,
  drop column if exists depth_at,
  add column if not exists prices_gz text,
  add column if not exists volume_gz text;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using ((select auth.uid()) = id);
