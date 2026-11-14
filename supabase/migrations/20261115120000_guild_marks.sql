-- Guild section: "Mark" instead of "Manage". The data of every guild is public, so any number of
-- players may mark the same guild; each player marks one guild for now. A guild is tracked (daily
-- snapshot) while at least one player has it marked. Server only, like the other guild tables.

create table if not exists public.guild_marks (
  user_id uuid primary key references auth.users (id) on delete cascade, -- one marked guild per player
  guild_id text not null references public.guilds (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists guild_marks_guild on public.guild_marks (guild_id);

alter table public.guild_marks enable row level security;
revoke all on public.guild_marks from anon, authenticated;

-- a guild someone manages today becomes a guild they have marked
insert into public.guild_marks (user_id, guild_id)
select manager_id, id from public.guilds where manager_id is not null
on conflict (user_id) do nothing;

-- every kind of fame Albion counts, so the Activity tab can show each one gained per week and month.
-- Empty (null) on older rows: those days were not counted, and must not look like 0 fame.
alter table public.guild_snapshots
  add column if not exists fishing bigint,
  add column if not exists farming bigint,
  add column if not exists crystal bigint;

drop index if exists public.guilds_sync_due;
alter table public.guilds drop column if exists manager_id;
create index if not exists guilds_last_synced on public.guilds (last_synced_at);
