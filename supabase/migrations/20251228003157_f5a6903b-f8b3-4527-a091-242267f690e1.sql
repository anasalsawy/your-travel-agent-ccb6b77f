-- Create payment_proofs table (order payment proofs)
create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null,
  payment_attempt_id uuid not null,
  proof_upload_url text not null,
  created_at timestamptz not null default now()
);

-- Ensure one proof per order per attempt (idempotency)
create unique index if not exists payment_proofs_order_attempt_unique
  on public.payment_proofs(order_id, payment_attempt_id);

create index if not exists payment_proofs_order_id_idx on public.payment_proofs(order_id);
create index if not exists payment_proofs_user_id_idx on public.payment_proofs(user_id);

alter table public.payment_proofs enable row level security;

-- Users can view their own payment proofs (for their orders)
create policy "Users can view own payment proofs"
on public.payment_proofs
for select
using (user_id = auth.uid());

-- Staff/admin can view all payment proofs
create policy "Staff and admins can view all payment proofs"
on public.payment_proofs
for select
using (public.is_staff_or_admin(auth.uid()));

-- Users can create payment proofs only for their own orders
create policy "Users can create own payment proofs"
on public.payment_proofs
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.orders o
    where o.id = order_id and o.user_id = auth.uid()
  )
);

-- Staff/admin can delete proofs if needed
create policy "Staff and admins can delete payment proofs"
on public.payment_proofs
for delete
using (public.is_staff_or_admin(auth.uid()));

-- Atomic submit function: insert payment_proof + update order status
create or replace function public.submit_order_payment_proof(
  p_order_id uuid,
  p_proof_upload_url text
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_user_id uuid;
  v_attempt_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Lock row to make this idempotent under concurrency
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.user_id is distinct from v_user_id then
    raise exception 'Not allowed';
  end if;

  -- Enforce idempotency: only allow when awaiting payment (pending) OR admin reset to pending after rejection
  if v_order.payment_status is distinct from 'pending'::payment_status then
    raise exception 'Payment proof already submitted or order not awaiting payment';
  end if;

  v_attempt_id := coalesce(v_order.payment_attempt_id, gen_random_uuid());

  insert into public.payment_proofs(order_id, user_id, payment_attempt_id, proof_upload_url)
  values (p_order_id, v_user_id, v_attempt_id, p_proof_upload_url);

  update public.orders
  set
    payment_status = 'under_review'::payment_status,
    order_status = 'payment_under_review'::order_status,
    payment_submitted_at = now(),
    proof_upload_url = p_proof_upload_url,
    payment_attempt_id = v_attempt_id,
    updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.submit_order_payment_proof(uuid, text) from public;
grant execute on function public.submit_order_payment_proof(uuid, text) to authenticated;
