CREATE OR REPLACE FUNCTION public.agent_list_tables()
RETURNS TABLE(table_name text, columns text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.relname::text,
         string_agg(a.attname::text || ':' || format_type(a.atttypid, a.atttypmod), ', ' ORDER BY a.attnum)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p')
  GROUP BY c.relname
$$;

CREATE OR REPLACE FUNCTION public.agent_sql(q text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned text := btrim(regexp_replace(q, ';\s*$', ''));
  result jsonb;
BEGIN
  IF cleaned !~* '^\s*(select|with)\s' THEN
    RAISE EXCEPTION 'agent_sql accepts only SELECT/WITH queries';
  END IF;
  IF cleaned ~* '(insert|update|delete|drop|alter|create|grant|revoke|truncate)\s' AND cleaned !~* '^\s*with' THEN
    -- allow words inside strings but block obvious statement chaining
    IF cleaned ~* ';' THEN
      RAISE EXCEPTION 'multiple statements not allowed';
    END IF;
  END IF;
  EXECUTE 'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (' || cleaned || ' LIMIT 500) t' INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_sql(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_list_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_sql(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_list_tables() TO service_role;