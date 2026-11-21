-- Guild Pro (premium):
-- 1. Several marked guilds per server: the primary key gets the guild. The oldest mark on a server
--    stays the player's main guild there (the Discord report and the ZvZ report are about it); the
--    API allows a second one and more only with premium.
-- 2. 90 days of attendance: the GitHub job (guild-zvz.yml -> /api/guild/pro-fights) keeps the fights
--    of every guild a Guild Pro player marked, 95 days. Albion's killboard itself only lists the
--    last days, so the history starts when the guild is first marked by a Guild Pro player.
-- Server only, like the other guild tables.

alter table public.guild_marks drop constraint if exists guild_marks_pkey;
alter table public.guild_marks add primary key (user_id, region, guild_id);

create table if not exists public.guild_fights (
  guild_id text not null references public.guilds (id) on delete cascade,
  battle_id bigint not null,
  start_time timestamptz not null,
  fight jsonb not null, -- what the attendance needs: players, kills, fame, enemy, ours [{id, name, kills, deaths, killFame}]
  primary key (guild_id, battle_id)
);
create index if not exists guild_fights_time on public.guild_fights (guild_id, start_time desc);

alter table public.guilds add column if not exists fights_synced_at timestamptz;

alter table public.guild_fights enable row level security;
revoke all on public.guild_fights from anon, authenticated;
