-- Guild section: the Discord report. A player who marked a guild can give a Discord webhook; the
-- daily guild sync then posts that guild's report there once a day. The webhook URL is a secret of
-- the player's Discord server: server only, never sent back to the browser (only its name).

create table if not exists public.guild_webhooks (
  user_id uuid primary key references auth.users (id) on delete cascade, -- one webhook per player
  url text not null,
  name text,
  last_sent_on date,
  created_at timestamptz not null default now()
);

alter table public.guild_webhooks enable row level security;
revoke all on public.guild_webhooks from anon, authenticated;
