-- Guild Pro (premium): the ZvZ report. A premium player with a Discord webhook can turn it on; a job
-- every 30 minutes then posts the report of each big fight of their marked guild to that webhook.
-- zvz_after: the start of the newest fight already posted (or when it was turned on): only fights
-- after it are new. Server only, like the rest of guild_webhooks (RLS on, no grants).

alter table public.guild_webhooks add column if not exists zvz boolean not null default false;
alter table public.guild_webhooks add column if not exists zvz_after timestamptz;
