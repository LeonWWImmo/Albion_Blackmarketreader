-- Guild section, phase 1: the guilds people manage on blackmarketreader.com and the daily
-- snapshots of their members (Albion's public killboard data, see api/_lib/gameinfo.js).
-- Only the server (api/guild.js, service role) reads and writes these tables: RLS is on and there
-- are no policies, so the browser's anon / authenticated keys see nothing.

create table if not exists public.guilds (
  id text primary key,                      -- Albion's guild id
  region text not null check (region in ('eu', 'us')),
  name text not null,
  slug text not null,                       -- the URL part: /guild/eu/<slug>
  alliance_tag text,
  founded_at timestamptz,
  member_count integer not null default 0,
  kill_fame bigint not null default 0,
  death_fame bigint not null default 0,
  manager_id uuid unique references auth.users (id) on delete set null, -- one guild per player for now
  tracked_since date,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists guilds_region_slug on public.guilds (region, slug);
create index if not exists guilds_sync_due on public.guilds (last_synced_at) where manager_id is not null;

-- one row per player who has been in the guild since tracking started
create table if not exists public.guild_players (
  guild_id text not null references public.guilds (id) on delete cascade,
  player_id text not null,
  name text not null,
  joined_on date not null,                  -- the day we first saw them in the guild
  left_on date,                             -- null while they are in the guild
  last_gain_on date,                        -- last day their fame grew between two snapshots
  stats_at timestamptz,                     -- when Albion last updated their statistics
  last_fight_at timestamptz,                -- their last guild fight on the killboard
  primary key (guild_id, player_id)
);

-- each member's lifetime fame, once per day
create table if not exists public.guild_snapshots (
  guild_id text not null references public.guilds (id) on delete cascade,
  player_id text not null,
  day date not null,
  pve bigint not null default 0,
  kill_fame bigint not null default 0,
  death_fame bigint not null default 0,
  gathering bigint not null default 0,
  crafting bigint not null default 0,
  primary key (guild_id, player_id, day)
);
create index if not exists guild_snapshots_day on public.guild_snapshots (guild_id, day);

alter table public.guilds enable row level security;
alter table public.guild_players enable row level security;
alter table public.guild_snapshots enable row level security;
revoke all on public.guilds, public.guild_players, public.guild_snapshots from anon, authenticated;
