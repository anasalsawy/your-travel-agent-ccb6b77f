
create or replace function public._cron_call(fn text, payload jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_base text; v_key text; v_req bigint;
begin
  select value into v_base from public._cron_secrets s where s.key = 'supabase_url';
  select value into v_key  from public._cron_secrets s where s.key = 'anon_key';
  select net.http_post(
    url := v_base || '/functions/v1/' || fn,
    headers := jsonb_build_object('Authorization','Bearer '||v_key,'Content-Type','application/json'),
    body := payload,
    timeout_milliseconds := 55000
  ) into v_req;
  return v_req;
end $$;
