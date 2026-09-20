-- Global Punjabi Classes Fee Portal
create extension if not exists "pgcrypto";

create type public.payment_status as enum ('PENDING','PROCESSING','PAID','VERIFYING','FAILED','REFUNDED');
create type public.payment_method as enum ('PAYPAL','BANK_TRANSFER','UPI','REMITLY','OTHER');

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  serial_number integer unique not null,
  student_name text not null,
  age integer,
  country text not null,
  timing text,
  days text,
  monthly_fee numeric(12,2) not null,
  currency text not null default 'USD',
  parent_name text,
  parent_email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fee_invoices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  fee_month date not null,
  amount numeric(12,2) not null,
  currency text not null,
  status public.payment_status not null default 'PENDING',
  secure_token text unique not null default encode(gen_random_bytes(24),'hex'),
  payment_method public.payment_method,
  payment_reference text,
  paypal_order_id text,
  paypal_capture_id text,
  paid_at timestamptz,
  invoice_number text unique,
  invoice_pdf_url text,
  manual_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, fee_month)
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.fee_invoices(id) on delete set null,
  provider text not null,
  event_id text unique,
  event_type text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fee_invoices_month_status_idx on public.fee_invoices(fee_month,status);
create index if not exists students_country_idx on public.students(country);
create index if not exists students_parent_email_idx on public.students(parent_email);

-- Never expose these tables directly to anonymous users.
alter table public.students enable row level security;
alter table public.fee_invoices enable row level security;
alter table public.payment_events enable row level security;

-- The app's server uses the service-role key for privileged operations.
-- Do not put SUPABASE_SERVICE_ROLE_KEY in browser code.

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists students_touch on public.students;
create trigger students_touch before update on public.students
for each row execute procedure public.touch_updated_at();

drop trigger if exists fee_invoices_touch on public.fee_invoices;
create trigger fee_invoices_touch before update on public.fee_invoices
for each row execute procedure public.touch_updated_at();
