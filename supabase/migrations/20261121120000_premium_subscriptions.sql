-- Premium: one subscription per player, sold through Lemon Squeezy. Only the billing webhook
-- (server, service role) writes here; a player reads their own row. Premium tables use
-- public.is_premium() in their RLS policies, so the data itself stays closed without a subscription.
--
-- Replaces the old, never used Stripe table of the same name (it had no rows, no functions or
-- triggers used it). The guard below stops if it ever got rows.

do $$
begin
  if to_regclass('public.subscriptions') is not null and exists (select 1 from public.subscriptions) then
    raise exception 'public.subscriptions has rows: not replacing it';
  end if;
end $$;

drop table if exists public.subscriptions;

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade, -- one subscription per player
  subscription_id text not null unique, -- Lemon Squeezy subscription id
  customer_id text,
  variant_id text,
  -- Lemon Squeezy status: on_trial, active, paused, past_due, unpaid, cancelled, expired
  status text not null,
  renews_at timestamptz,
  ends_at timestamptz, -- set once cancelled: premium lasts until then
  test_mode boolean not null default false,
  provider_updated_at timestamptz not null, -- Lemon Squeezy's updated_at, to skip events that arrive late
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

create policy "read own subscription" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

-- True while the signed-in player has premium. Same rule as isPremium() in api/_lib/billing.js:
-- on trial, active or past due (Lemon Squeezy is still retrying the payment), or cancelled but
-- paid until ends_at.
create or replace function public.is_premium()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = (select auth.uid())
      and (s.status in ('on_trial', 'active', 'past_due') or (s.status = 'cancelled' and s.ends_at > now()))
  );
$$;

revoke all on function public.is_premium() from public;
grant execute on function public.is_premium() to authenticated;
