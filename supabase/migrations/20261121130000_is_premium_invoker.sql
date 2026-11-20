-- public.is_premium() needs no extra rights: a signed-in player may read their own subscription row
-- anyway (policy "read own subscription"), so it runs as the caller. Supabase's default privileges
-- had also given anon EXECUTE (the Security Advisor flagged both); anon never has premium.

alter function public.is_premium() security invoker;
revoke execute on function public.is_premium() from anon;
