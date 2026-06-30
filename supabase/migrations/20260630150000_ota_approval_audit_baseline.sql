-- OTA approval and action audit baseline

create table if not exists public.booking_action_audit (
  id uuid primary key default gen_random_uuid(),
  booking_ref text not null,
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  requested_by uuid,
  provider text,
  status text not null default 'requested',
  response_payload jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  booking_ref text not null,
  action_type text not null,
  reason text,
  requested_by uuid,
  approved_by uuid,
  decision text not null default 'pending',
  decision_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists idx_booking_action_audit_booking_ref
  on public.booking_action_audit (booking_ref, created_at desc);

create index if not exists idx_approval_requests_booking_ref
  on public.approval_requests (booking_ref, created_at desc);
