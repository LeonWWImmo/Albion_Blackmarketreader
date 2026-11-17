-- Guild section: one marked guild per server (Europe and America) instead of one per player, and the
-- Discord report per server too: a player with a guild marked on each server gets both reports, each
-- to its own webhook (the same link on both is fine). Server only, like the other guild tables.

alter table public.guild_marks add column if not exists region text;
update public.guild_marks m set region = g.region from public.guilds g where g.id = m.guild_id and m.region is null;
alter table public.guild_marks alter column region set not null;
alter table public.guild_marks drop constraint if exists guild_marks_region_check;
alter table public.guild_marks add constraint guild_marks_region_check check (region in ('eu', 'us'));
alter table public.guild_marks drop constraint if exists guild_marks_pkey;
alter table public.guild_marks add primary key (user_id, region); -- one marked guild per player and server

-- a webhook from before belongs to the server of its player's marked guild (Europe without a mark)
alter table public.guild_webhooks add column if not exists region text;
update public.guild_webhooks w
set region = coalesce((select m.region from public.guild_marks m where m.user_id = w.user_id limit 1), 'eu')
where w.region is null;
alter table public.guild_webhooks alter column region set not null;
alter table public.guild_webhooks drop constraint if exists guild_webhooks_region_check;
alter table public.guild_webhooks add constraint guild_webhooks_region_check check (region in ('eu', 'us'));
alter table public.guild_webhooks drop constraint if exists guild_webhooks_pkey;
alter table public.guild_webhooks add primary key (user_id, region); -- one webhook per player and server
