
update public.ao_missions m
   set status = 'archived', needs_human = false,
       escalation_reason = 'archived: demo/simulation mission with no customer attached'
 where m.status <> 'archived'
   and not exists (select 1 from public.ao_leads l where l.mission_id = m.id);

update public.ao_delegations d
   set status = 'cancelled',
       escalation_reason = coalesce(d.escalation_reason,'') || ' [cancelled: target archived or unreachable]'
 where d.status in ('assigned','retry','running')
   and (
     exists (select 1 from public.ao_missions m where m.id = d.mission_id and m.status = 'archived')
     or exists (select 1 from public.ao_leads l where l.id = d.lead_id and l.status = 'unreachable')
   );
