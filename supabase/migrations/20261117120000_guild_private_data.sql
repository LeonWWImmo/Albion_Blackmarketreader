-- Guild section: what a signed-in player keeps for themselves. Private per account for now: two
-- players who marked the same guild each see only their own. Server only, like the other guild
-- tables (api/guild.js reads and writes them with the service role key).

-- Regear: the deaths a player ticked as paid, per fight.
create table if not exists public.guild_regear_paid (
  user_id uuid not null references auth.users (id) on delete cascade,
  region text not null check (region in ('eu', 'us')),
  battle_id bigint not null,
  event_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, region, event_id)
);
create index if not exists guild_regear_paid_battle on public.guild_regear_paid (user_id, region, battle_id);

-- Bank log: the guild chest log a player pasted, all rows of one guild in one list.
create table if not exists public.guild_bank_logs (
  user_id uuid not null references auth.users (id) on delete cascade,
  guild_id text not null,
  rows jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, guild_id)
);

-- Bank log: loot splits a player saved (the items, who gets how much, who is paid already).
create table if not exists public.guild_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  guild_id text not null,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists guild_splits_owner on public.guild_splits (user_id, guild_id, created_at desc);

alter table public.guild_regear_paid enable row level security;
alter table public.guild_bank_logs enable row level security;
alter table public.guild_splits enable row level security;
revoke all on public.guild_regear_paid from anon, authenticated;
revoke all on public.guild_bank_logs from anon, authenticated;
revoke all on public.guild_splits from anon, authenticated;
