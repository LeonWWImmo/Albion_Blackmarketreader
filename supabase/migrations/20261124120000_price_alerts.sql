-- Price alerts (premium): a player sets "this item drops below X" or "a buy order rises above X" on
-- the Price Checker; every 30 minutes the GitHub job (market-live.yml -> /api/market/alerts-run)
-- checks them against AODP and posts the ones that hit to the player's own Discord webhook.
-- Server only (service role): RLS on, no policies. The webhook URL never goes back to the browser.

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  region text not null check (region in ('eu', 'us')),
  item_id text not null,
  item_name text not null,
  path text not null,                                  -- the Price Checker page of the item
  quality smallint not null default 1 check (quality between 1 and 5),
  market text not null,                                -- a market name, or 'ANY'
  side text not null check (side in ('below', 'above')), -- below: cheapest listing <= price; above: best buy order >= price
  price bigint not null check (price > 0),
  armed boolean not null default true,                 -- false after it fired, true again once the price went back
  fired_at timestamptz,
  fired_price bigint,
  created_at timestamptz not null default now()
);

create index if not exists price_alerts_user on public.price_alerts (user_id);

create table if not exists public.alert_webhooks (
  user_id uuid primary key references auth.users (id) on delete cascade, -- one webhook per player
  url text not null,
  name text,
  created_at timestamptz not null default now()
);

alter table public.price_alerts enable row level security;
alter table public.alert_webhooks enable row level security;
revoke all on public.price_alerts from anon, authenticated;
revoke all on public.alert_webhooks from anon, authenticated;
