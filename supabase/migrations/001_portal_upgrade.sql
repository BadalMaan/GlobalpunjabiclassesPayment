-- Global Punjabi Classes: production upgrade migration
create extension if not exists "pgcrypto";

alter type public.payment_method add value if not exists 'RAZORPAY';
alter type public.payment_method add value if not exists 'WISE';
alter type public.payment_method add value if not exists 'PAYONEER';

alter table public.students
  add column if not exists parent_phone text,
  add column if not exists whatsapp_phone text,
  add column if not exists gender text,
  add column if not exists teacher_name text,
  add column if not exists groups text[] not null default '{}';

create index if not exists students_teacher_idx on public.students(teacher_name);
create index if not exists students_phone_idx on public.students(parent_phone);
create index if not exists students_whatsapp_idx on public.students(whatsapp_phone);

alter table public.fee_invoices
  add column if not exists provider_transaction_id text,
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text,
  add column if not exists wise_transfer_id text,
  add column if not exists payoneer_reference text,
  add column if not exists expires_at timestamptz,
  add column if not exists payment_verified_at timestamptz,
  add column if not exists payment_verified_by text,
  add column if not exists payment_notes text;

create unique index if not exists fee_invoices_provider_transaction_idx
  on public.fee_invoices(provider_transaction_id)
  where provider_transaction_id is not null;

create table if not exists public.payment_groups (
  id uuid primary key default gen_random_uuid(),
  secure_token text unique not null default encode(gen_random_bytes(24),'hex'),
  fee_month date not null,
  amount numeric(12,2) not null,
  currency text not null,
  status public.payment_status not null default 'PENDING',
  payment_method public.payment_method,
  provider_transaction_id text,
  payment_reference text,
  razorpay_order_id text,
  razorpay_payment_id text,
  paypal_order_id text,
  paypal_capture_id text,
  wise_transfer_id text,
  payoneer_reference text,
  paid_at timestamptz,
  payment_verified_at timestamptz,
  payment_verified_by text,
  invoice_number text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_group_items (
  id uuid primary key default gen_random_uuid(),
  payment_group_id uuid not null references public.payment_groups(id) on delete cascade,
  invoice_id uuid not null references public.fee_invoices(id) on delete cascade,
  amount numeric(12,2) not null,
  unique(payment_group_id, invoice_id),
  unique(invoice_id)
);

create index if not exists payment_groups_month_status_idx on public.payment_groups(fee_month,status);
create index if not exists payment_group_items_group_idx on public.payment_group_items(payment_group_id);

create table if not exists public.message_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete set null,
  payment_group_id uuid references public.payment_groups(id) on delete set null,
  channel text not null check (channel in ('EMAIL','WHATSAPP')),
  destination text not null,
  template_name text,
  status text not null,
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.payment_groups enable row level security;
alter table public.payment_group_items enable row level security;
alter table public.message_log enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.touch_payment_group_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists payment_groups_touch on public.payment_groups;
create trigger payment_groups_touch before update on public.payment_groups
for each row execute procedure public.touch_payment_group_updated_at();
