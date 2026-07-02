
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public._cron_secrets (
  key text primary key,
  value text not null
);
grant select, insert, update on public._cron_secrets to service_role;
alter table public._cron_secrets enable row level security;

insert into public._cron_secrets(key, value) values
  ('supabase_url', 'https://wpwdxtyufpewdyffxlgo.supabase.co'),
  ('anon_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2R4dHl1ZnBld2R5ZmZ4bGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4MzI3NTQsImV4cCI6MjA4MjQwODc1NH0.seaxklRqvLLdqloVqEeKDg8P1fZlWLP5hrMuaOMfChE')
on conflict (key) do update set value = excluded.value;

create table if not exists public.war_room_cron_log (
  id bigserial primary key,
  job text not null,
  req_id bigint,
  fired_at timestamptz not null default now()
);
grant select on public.war_room_cron_log to authenticated, anon;
grant all on public.war_room_cron_log to service_role;
alter table public.war_room_cron_log enable row level security;
drop policy if exists "cron_log_read_all" on public.war_room_cron_log;
create policy "cron_log_read_all" on public.war_room_cron_log for select using (true);

create or replace function public._cron_call(fn text, payload jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  base text; key text; req_id bigint;
begin
  select value into base from public._cron_secrets where key = 'supabase_url';
  select value into key  from public._cron_secrets where key = 'anon_key';
  select net.http_post(
    url := base || '/functions/v1/' || fn,
    headers := jsonb_build_object('Authorization','Bearer '||key,'Content-Type','application/json'),
    body := payload,
    timeout_milliseconds := 55000
  ) into req_id;
  return req_id;
end $$;

create or replace function public._cron_fire(job text, fn text, payload jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare rid bigint;
begin
  rid := public._cron_call(fn, payload);
  insert into public.war_room_cron_log(job, req_id) values (job, rid);
end $$;

create or replace function public.war_room_stale_sweep()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare nudged int := 0; r record;
begin
  for r in
    select distinct t.assignee
    from war_room_tasks t
    left join war_room_heartbeats h on h.agent_name = t.assignee
    where t.status in ('todo','doing')
      and (h.last_beat_at is null or h.last_beat_at < now() - interval '3 minutes')
      and not exists (
        select 1 from war_room_tasks x
        where x.assignee = t.assignee and x.status in ('todo','doing')
          and x.title like 'NUDGE:%' and x.created_at > now() - interval '5 minutes'
      )
  loop
    insert into war_room_tasks(title, description, assignee, priority, created_by, status)
    values ('NUDGE: heartbeat required',
      'Server-side watchdog: no heartbeat in >3min while you hold open work. Post war_room_post + war_room_heartbeat NOW.',
      r.assignee, 1, 'chief-of-staff', 'todo');
    insert into war_room_messages(agent_name, role, content, addressed_to, meta)
    values ('chief-of-staff','assistant',
      '@'||r.assignee||' — you have gone silent while holding open work. Fire war_room_heartbeat immediately or I reassign.',
      array[r.assignee]::text[],
      jsonb_build_object('via','stale_sweep'));
    nudged := nudged + 1;
  end loop;
  return nudged;
end $$;

do $$
declare j record;
begin
  for j in select jobname from cron.job where jobname in ('war_room_tick','shopper_watchdog','war_room_stale_sweep') loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

select cron.schedule('war_room_tick', '* * * * *', $cron$
  select public._cron_fire('war_room_tick','war-room','{"action":"tick"}'::jsonb);
$cron$);

select cron.schedule('shopper_watchdog', '* * * * *', $cron$
  select public._cron_fire('shopper_watchdog','shopper-watchdog','{}'::jsonb);
$cron$);

select cron.schedule('war_room_stale_sweep', '*/2 * * * *', $cron$
  select public.war_room_stale_sweep();
$cron$);
