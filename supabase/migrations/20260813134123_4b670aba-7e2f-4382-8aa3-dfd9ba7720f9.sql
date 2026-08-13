
update public.ao_delegations
   set status = 'cancelled',
       escalation_reason = coalesce(escalation_reason,'') || ' [cancelled: routing defect, superseded]'
 where status = 'escalated';

update public.ao_missions
   set needs_human = false,
       status = 'open',
       escalation_reason = null
 where needs_human = true and status = 'escalated';

update public.ao_leads
   set status = 'unreachable',
       notes = 'parked: no psid/thread, no email, no phone',
       next_action_at = now() + interval '30 days'
 where status in ('blocked','escalated')
   and coalesce(external_thread_id,'') = ''
   and coalesce(contact->>'email','') = ''
   and coalesce(contact->>'phone','') = ''
   and coalesce(contact->>'psid','') = '';
