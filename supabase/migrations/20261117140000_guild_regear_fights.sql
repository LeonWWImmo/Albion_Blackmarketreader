-- Guild section, Regear: the fights a player marked to regear, so the officer who manages the regear
-- finds them again later (also after the 7 days the killboard list goes back). Private per account,
-- like the paid ticks; server only (api/guild.js reads and writes it with the service role key).
create table if not exists public.guild_regear_fights (
  user_id uuid not null references auth.users (id) on delete cascade,
  region text not null check (region in ('eu', 'us')),
  guild_id text not null,
  battle_id bigint not null,
  -- what the fight list shows: start time, players, ours, kills, deaths, enemy
  info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, region, battle_id)
);
create index if not exists guild_regear_fights_guild on public.guild_regear_fights (user_id, region, guild_id, created_at desc);

alter table public.guild_regear_fights enable row level security;
revoke all on public.guild_regear_fights from anon, authenticated;
