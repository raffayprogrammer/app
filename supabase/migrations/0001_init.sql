-- WorkshopPOS core schema (multi-workshop SaaS) for Supabase Postgres.
--
-- Every business table carries workshop_id and is protected by row-level
-- security, so a user can only ever see their own workshop's data.
-- Money is stored as integer paisa (bigint). Invoices, payments, stock
-- movements and the audit log are append-only: no delete policies exist.
--
-- Operations that must be atomic (numbering, completing work, issuing an
-- invoice, taking a payment) are SQL functions so two counters can't race.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type user_role as enum ('owner', 'advisor', 'technician', 'cashier');
create type ro_status as enum ('estimate', 'in_progress', 'completed', 'invoiced', 'closed', 'cancelled');
create type work_label as enum ('none', 'in_bay', 'waiting_parts', 'waiting_customer', 'quality_check', 'ready');
create type job_approval as enum ('pending', 'approved', 'declined');
create type line_kind as enum ('labor', 'part', 'fee');
create type invoice_status as enum ('unpaid', 'partial', 'paid', 'void');
create type payment_method as enum ('cash', 'card', 'bank', 'jazzcash', 'easypaisa', 'other');
create type movement_reason as enum ('opening', 'adjustment', 'used_on_job', 'returned_from_job');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table workshops (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) > 0),
  phone            text not null default '',
  email            text not null default '',
  address          text not null default '',
  city             text not null default '',
  ntn              text not null default '',
  labor_rate       bigint not null default 200000 check (labor_rate >= 0),
  parts_tax_rate   numeric(5, 2) not null default 18 check (parts_tax_rate between 0 and 100),
  labor_tax_rate   numeric(5, 2) not null default 0 check (labor_tax_rate between 0 and 100),
  invoice_prefix   text not null default 'INV' check (invoice_prefix ~ '^[A-Z0-9-]{1,8}$'),
  next_invoice_seq integer not null default 1,
  next_ro_seq      integer not null default 1001,
  printer          jsonb not null default '{"paper": "80mm", "footer": "Thank you for your visit!", "autoPrintAfterPayment": false, "baudRate": 9600}',
  created_at       timestamptz not null default now()
);

-- Staff accounts. One login belongs to one workshop.
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  workshop_id uuid not null references workshops (id),
  name        text not null,
  email       text not null,
  role        user_role not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on profiles (workshop_id);

create table customers (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops (id),
  kind        text not null default 'individual' check (kind in ('individual', 'company')),
  name        text not null check (length(trim(name)) > 0),
  phone       text not null,
  email       text not null default '',
  address     text not null default '',
  ntn         text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now()
);
create index on customers (workshop_id, name);
create index on customers (workshop_id, phone);

create table vehicles (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops (id),
  customer_id uuid not null references customers (id),
  plate       text not null,
  -- "LEA-19-1234" and "lea 19 1234" are the same car.
  plate_key   text generated always as (upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g'))) stored,
  make        text not null,
  model       text not null,
  year        text not null default '',
  vin         text not null default '',
  color       text not null default '',
  odometer    integer check (odometer >= 0),
  created_at  timestamptz not null default now(),
  unique (workshop_id, plate_key)
);
create index on vehicles (customer_id);

create table parts (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops (id),
  part_number text not null default '',
  name        text not null check (length(trim(name)) > 0),
  brand       text not null default '',
  category    text not null default '',
  location    text not null default '',
  cost        bigint not null default 0 check (cost >= 0),
  price       bigint not null default 0 check (price >= 0),
  qty_on_hand numeric(12, 2) not null default 0 check (qty_on_hand >= 0),
  min_qty     numeric(12, 2) not null default 0 check (min_qty >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index parts_number_unique on parts (workshop_id, lower(part_number)) where part_number <> '';

create table canned_jobs (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops (id),
  title       text not null,
  -- [{kind, description, partId, qty, unitPrice}]
  lines       jsonb not null default '[]'
);

create table repair_orders (
  id             uuid primary key default gen_random_uuid(),
  workshop_id    uuid not null references workshops (id),
  number         integer not null,
  customer_id    uuid not null references customers (id),
  vehicle_id     uuid not null references vehicles (id),
  status         ro_status not null default 'estimate',
  label          work_label not null default 'none',
  technician_id  uuid references profiles (id),
  concern        text not null default '',
  notes          text not null default '',
  odometer_in    integer check (odometer_in >= 0),
  promised_at    timestamptz,
  discount       bigint not null default 0 check (discount >= 0),
  stock_deducted boolean not null default false,
  invoice_id     uuid,
  created_by     uuid not null references profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz,
  unique (workshop_id, number)
);
create index on repair_orders (workshop_id, status);
create index on repair_orders (vehicle_id);
-- A car can only have one open job card at a time.
create unique index one_open_ro_per_vehicle on repair_orders (vehicle_id)
  where status in ('estimate', 'in_progress', 'completed');

create table jobs (
  id              uuid primary key default gen_random_uuid(),
  workshop_id     uuid not null references workshops (id),
  repair_order_id uuid not null references repair_orders (id) on delete cascade,
  title           text not null,
  approval        job_approval not null default 'pending',
  done            boolean not null default false,
  sort_order      integer not null default 0
);
create index on jobs (repair_order_id);

create table job_lines (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops (id),
  job_id      uuid not null references jobs (id) on delete cascade,
  kind        line_kind not null,
  description text not null,
  part_id     uuid references parts (id),
  qty         numeric(10, 2) not null check (qty > 0),
  unit_price  bigint not null check (unit_price >= 0),
  sort_order  integer not null default 0,
  check (kind <> 'part' or part_id is not null)
);
create index on job_lines (job_id);

create table invoices (
  id             uuid primary key default gen_random_uuid(),
  workshop_id    uuid not null references workshops (id),
  seq            integer not null,
  number         text not null,
  repair_order_id uuid not null references repair_orders (id),
  customer_id    uuid not null references customers (id),
  vehicle_id     uuid not null references vehicles (id),
  parts_tax_rate numeric(5, 2) not null,
  labor_tax_rate numeric(5, 2) not null,
  parts          bigint not null,
  labor          bigint not null,
  fees           bigint not null,
  discount       bigint not null,
  parts_tax      bigint not null,
  labor_tax      bigint not null,
  total          bigint not null,
  status         invoice_status not null default 'unpaid',
  void_reason    text not null default '',
  created_by     uuid not null references profiles (id),
  issued_at      timestamptz not null default now(),
  unique (workshop_id, seq),
  unique (workshop_id, number)
);
alter table repair_orders add foreign key (invoice_id) references invoices (id);

-- Snapshot of the approved lines at the moment of invoicing.
create table invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops (id),
  invoice_id  uuid not null references invoices (id),
  job_title   text not null,
  kind        line_kind not null,
  description text not null,
  part_id     uuid references parts (id),
  qty         numeric(10, 2) not null,
  unit_price  bigint not null,
  amount      bigint not null,
  sort_order  integer not null default 0
);
create index on invoice_lines (invoice_id);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops (id),
  invoice_id  uuid not null references invoices (id),
  method      payment_method not null,
  amount      bigint not null check (amount > 0),
  reference   text not null default '',
  user_id     uuid not null references profiles (id),
  received_at timestamptz not null default now()
);
create index on payments (invoice_id);
create index on payments (workshop_id, received_at);

create table stock_movements (
  id              uuid primary key default gen_random_uuid(),
  workshop_id     uuid not null references workshops (id),
  part_id         uuid not null references parts (id),
  qty             numeric(12, 2) not null check (qty <> 0),
  reason          movement_reason not null,
  repair_order_id uuid references repair_orders (id),
  note            text not null default '',
  user_id         uuid not null references profiles (id),
  created_at      timestamptz not null default now()
);
create index on stock_movements (part_id, created_at);

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops (id),
  user_id     uuid references profiles (id),
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  summary     text not null default '',
  at          timestamptz not null default now()
);
create index on audit_log (workshop_id, at desc);

-- ---------------------------------------------------------------------------
-- Session helpers (used by policies and functions)
-- ---------------------------------------------------------------------------
create or replace function current_workshop_id() returns uuid
language sql stable security definer set search_path = public as $$
  select workshop_id from profiles where id = auth.uid() and active
$$;

create or replace function has_role(variadic roles user_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role = any (roles))
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table workshops       enable row level security;
alter table profiles        enable row level security;
alter table customers       enable row level security;
alter table vehicles        enable row level security;
alter table parts           enable row level security;
alter table canned_jobs     enable row level security;
alter table repair_orders   enable row level security;
alter table jobs            enable row level security;
alter table job_lines       enable row level security;
alter table invoices        enable row level security;
alter table invoice_lines   enable row level security;
alter table payments        enable row level security;
alter table stock_movements enable row level security;
alter table audit_log       enable row level security;

create policy "members read own workshop" on workshops for select using (id = current_workshop_id());
create policy "owner updates workshop" on workshops for update using (id = current_workshop_id() and has_role('owner'));

create policy "members read team" on profiles for select using (workshop_id = current_workshop_id());
create policy "owner manages team" on profiles for update using (workshop_id = current_workshop_id() and has_role('owner'));

-- Front desk data: everyone in the workshop can read; front-desk roles can write.
create policy "read customers" on customers for select using (workshop_id = current_workshop_id());
create policy "write customers" on customers for insert with check (workshop_id = current_workshop_id() and has_role('owner', 'advisor', 'cashier'));
create policy "edit customers" on customers for update using (workshop_id = current_workshop_id() and has_role('owner', 'advisor', 'cashier'));

create policy "read vehicles" on vehicles for select using (workshop_id = current_workshop_id());
create policy "write vehicles" on vehicles for insert with check (workshop_id = current_workshop_id() and has_role('owner', 'advisor', 'cashier'));
create policy "edit vehicles" on vehicles for update using (workshop_id = current_workshop_id() and has_role('owner', 'advisor', 'cashier'));

-- Stock quantity only changes through functions (adjust_stock, complete/reopen).
create policy "read parts" on parts for select using (workshop_id = current_workshop_id());
create policy "write parts" on parts for insert with check (workshop_id = current_workshop_id() and has_role('owner', 'cashier') and qty_on_hand = 0);
create policy "edit parts" on parts for update using (workshop_id = current_workshop_id() and has_role('owner', 'cashier'));

create policy "read canned jobs" on canned_jobs for select using (workshop_id = current_workshop_id());
create policy "owner writes canned jobs" on canned_jobs for all using (workshop_id = current_workshop_id() and has_role('owner'))
  with check (workshop_id = current_workshop_id() and has_role('owner'));

-- Job cards: technicians read the cards assigned to them; the rest of the team reads all.
create policy "read repair orders" on repair_orders for select using (
  workshop_id = current_workshop_id() and (not has_role('technician') or technician_id = auth.uid())
);
create policy "edit repair orders" on repair_orders for update using (workshop_id = current_workshop_id() and has_role('owner', 'advisor'));

create policy "read jobs" on jobs for select using (
  workshop_id = current_workshop_id() and exists (select 1 from repair_orders r where r.id = repair_order_id)
);
create policy "write jobs" on jobs for all using (workshop_id = current_workshop_id() and has_role('owner', 'advisor'))
  with check (workshop_id = current_workshop_id() and has_role('owner', 'advisor'));

create policy "read job lines" on job_lines for select using (
  workshop_id = current_workshop_id() and exists (select 1 from jobs j where j.id = job_id)
);
create policy "write job lines" on job_lines for all using (workshop_id = current_workshop_id() and has_role('owner', 'advisor'))
  with check (workshop_id = current_workshop_id() and has_role('owner', 'advisor'));

-- Money: never visible to technicians, never deleted, only created through functions.
create policy "read invoices" on invoices for select using (workshop_id = current_workshop_id() and has_role('owner', 'advisor', 'cashier'));
create policy "read invoice lines" on invoice_lines for select using (workshop_id = current_workshop_id() and has_role('owner', 'advisor', 'cashier'));
create policy "read payments" on payments for select using (workshop_id = current_workshop_id() and has_role('owner', 'advisor', 'cashier'));
create policy "read stock movements" on stock_movements for select using (workshop_id = current_workshop_id() and has_role('owner', 'advisor', 'cashier'));
create policy "owner reads audit log" on audit_log for select using (workshop_id = current_workshop_id() and has_role('owner'));

-- ---------------------------------------------------------------------------
-- Functions for operations that must be atomic
-- ---------------------------------------------------------------------------

-- Called once after a new user signs up: creates the workshop and makes them owner.
create or replace function create_workshop(p_name text, p_owner_name text, p_city text default '', p_phone text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then raise exception 'This account already belongs to a workshop'; end if;
  insert into workshops (name, city, phone, email)
    values (trim(p_name), p_city, p_phone, coalesce((select email from auth.users where id = auth.uid()), ''))
    returning id into v_ws;
  insert into profiles (id, workshop_id, name, email, role)
    values (auth.uid(), v_ws, trim(p_owner_name), coalesce((select email from auth.users where id = auth.uid()), ''), 'owner');
  insert into audit_log (workshop_id, user_id, action, entity, entity_id, summary)
    values (v_ws, auth.uid(), 'workshop.created', 'workshop', v_ws, 'Workshop created');
  return v_ws;
end $$;

-- Opens a job card with the next RO number (row lock on the workshop keeps numbers unique).
create or replace function open_repair_order(p_customer uuid, p_vehicle uuid, p_concern text, p_odometer integer,
  p_promised_at timestamptz, p_technician uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workshop_id();
  v_num integer;
  v_id uuid;
begin
  if not has_role('owner', 'advisor') then raise exception 'Not allowed'; end if;
  if not exists (select 1 from vehicles where id = p_vehicle and customer_id = p_customer and workshop_id = v_ws) then
    raise exception 'Vehicle does not belong to this customer';
  end if;
  update workshops set next_ro_seq = next_ro_seq + 1 where id = v_ws returning next_ro_seq - 1 into v_num;
  insert into repair_orders (workshop_id, number, customer_id, vehicle_id, concern, odometer_in, promised_at, technician_id, created_by)
    values (v_ws, v_num, p_customer, p_vehicle, coalesce(p_concern, ''), p_odometer, p_promised_at, p_technician, auth.uid())
    returning id into v_id;
  if p_odometer is not null then
    update vehicles set odometer = greatest(coalesce(odometer, 0), p_odometer) where id = p_vehicle;
  end if;
  insert into audit_log (workshop_id, user_id, action, entity, entity_id, summary)
    values (v_ws, auth.uid(), 'ro.created', 'repair_order', v_id, 'RO-' || v_num || ' opened');
  return v_id;
end $$;

-- Moves a job card to completed and takes approved parts out of stock in one transaction.
create or replace function complete_repair_order(p_ro uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ro repair_orders%rowtype;
  r record;
begin
  if not has_role('owner', 'advisor') then raise exception 'Not allowed'; end if;
  select * into v_ro from repair_orders where id = p_ro and workshop_id = current_workshop_id() for update;
  if not found then raise exception 'Job card not found'; end if;
  if v_ro.status <> 'in_progress' then raise exception 'Only jobs in progress can be completed'; end if;
  if exists (select 1 from jobs where repair_order_id = p_ro and approval = 'pending') then
    raise exception 'Approve or decline every pending job first';
  end if;
  for r in
    select l.part_id, sum(l.qty) as qty
    from job_lines l join jobs j on j.id = l.job_id
    where j.repair_order_id = p_ro and j.approval = 'approved' and l.kind = 'part'
    group by l.part_id
  loop
    update parts set qty_on_hand = qty_on_hand - r.qty where id = r.part_id and qty_on_hand >= r.qty;
    if not found then raise exception 'Not enough stock for part %', r.part_id; end if;
    insert into stock_movements (workshop_id, part_id, qty, reason, repair_order_id, note, user_id)
      values (v_ro.workshop_id, r.part_id, -r.qty, 'used_on_job', p_ro, 'Used on RO-' || v_ro.number, auth.uid());
  end loop;
  update jobs set done = true where repair_order_id = p_ro and approval = 'approved';
  update repair_orders
    set status = 'completed', stock_deducted = true, label = 'ready', completed_at = now(), updated_at = now()
    where id = p_ro;
  insert into audit_log (workshop_id, user_id, action, entity, entity_id, summary)
    values (v_ro.workshop_id, auth.uid(), 'ro.completed', 'repair_order', p_ro, 'RO-' || v_ro.number || ' work completed');
end $$;

-- Puts a completed (not yet invoiced) job card back in progress and returns its parts to stock.
create or replace function reopen_repair_order(p_ro uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ro repair_orders%rowtype;
  r record;
begin
  if not has_role('owner', 'advisor') then raise exception 'Not allowed'; end if;
  select * into v_ro from repair_orders where id = p_ro and workshop_id = current_workshop_id() for update;
  if not found or v_ro.status <> 'completed' then raise exception 'Only completed, uninvoiced job cards can be reopened'; end if;
  if v_ro.stock_deducted then
    for r in
      select l.part_id, sum(l.qty) as qty
      from job_lines l join jobs j on j.id = l.job_id
      where j.repair_order_id = p_ro and j.approval = 'approved' and l.kind = 'part'
      group by l.part_id
    loop
      update parts set qty_on_hand = qty_on_hand + r.qty where id = r.part_id;
      insert into stock_movements (workshop_id, part_id, qty, reason, repair_order_id, note, user_id)
        values (v_ro.workshop_id, r.part_id, r.qty, 'returned_from_job', p_ro, 'RO-' || v_ro.number || ' reopened', auth.uid());
    end loop;
  end if;
  update repair_orders
    set status = 'in_progress', stock_deducted = false, label = 'in_bay', completed_at = null, updated_at = now()
    where id = p_ro;
  insert into audit_log (workshop_id, user_id, action, entity, entity_id, summary)
    values (v_ro.workshop_id, auth.uid(), 'ro.reopened', 'repair_order', p_ro, 'RO-' || v_ro.number || ' reopened');
end $$;

-- Issues the invoice for a completed job card. Totals are computed here, never sent by the browser,
-- and the invoice number comes from a locked counter so numbers have no gaps or duplicates.
-- Mirrors computeTotals() in src/lib/calc.ts.
create or replace function issue_invoice(p_ro uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ro repair_orders%rowtype;
  v_ws workshops%rowtype;
  v_parts bigint; v_labor bigint; v_fees bigint; v_sub bigint; v_disc bigint;
  v_parts_disc bigint; v_parts_tax bigint; v_labor_tax bigint;
  v_seq integer;
  v_inv uuid;
begin
  if not has_role('owner', 'advisor', 'cashier') then raise exception 'Not allowed'; end if;
  select * into v_ro from repair_orders where id = p_ro and workshop_id = current_workshop_id() for update;
  if not found then raise exception 'Job card not found'; end if;
  if v_ro.status <> 'completed' then raise exception 'Complete the work before creating the invoice'; end if;

  select
    coalesce(sum(round(l.qty * l.unit_price)) filter (where l.kind = 'part'), 0),
    coalesce(sum(round(l.qty * l.unit_price)) filter (where l.kind = 'labor'), 0),
    coalesce(sum(round(l.qty * l.unit_price)) filter (where l.kind = 'fee'), 0)
  into v_parts, v_labor, v_fees
  from job_lines l join jobs j on j.id = l.job_id
  where j.repair_order_id = p_ro and j.approval = 'approved';

  v_sub := v_parts + v_labor + v_fees;
  v_disc := least(greatest(v_ro.discount, 0), v_sub);
  v_parts_disc := case when v_sub = 0 then 0 else round(v_disc::numeric * v_parts / v_sub) end;

  update workshops set next_invoice_seq = next_invoice_seq + 1 where id = v_ro.workshop_id
    returning * into v_ws;
  v_seq := v_ws.next_invoice_seq - 1;
  v_parts_tax := round((v_parts - v_parts_disc) * v_ws.parts_tax_rate / 100);
  v_labor_tax := round((v_labor + v_fees - (v_disc - v_parts_disc)) * v_ws.labor_tax_rate / 100);

  insert into invoices (workshop_id, seq, number, repair_order_id, customer_id, vehicle_id, parts_tax_rate, labor_tax_rate,
    parts, labor, fees, discount, parts_tax, labor_tax, total, created_by)
  values (v_ro.workshop_id, v_seq, v_ws.invoice_prefix || '-' || lpad(v_seq::text, 6, '0'), p_ro, v_ro.customer_id, v_ro.vehicle_id,
    v_ws.parts_tax_rate, v_ws.labor_tax_rate, v_parts, v_labor, v_fees, v_disc, v_parts_tax, v_labor_tax,
    v_sub - v_disc + v_parts_tax + v_labor_tax, auth.uid())
  returning id into v_inv;

  insert into invoice_lines (workshop_id, invoice_id, job_title, kind, description, part_id, qty, unit_price, amount, sort_order)
  select v_ro.workshop_id, v_inv, j.title, l.kind, l.description, l.part_id, l.qty, l.unit_price, round(l.qty * l.unit_price),
         row_number() over (order by j.sort_order, l.sort_order)
  from job_lines l join jobs j on j.id = l.job_id
  where j.repair_order_id = p_ro and j.approval = 'approved';

  update repair_orders set status = 'invoiced', invoice_id = v_inv, updated_at = now() where id = p_ro;
  insert into audit_log (workshop_id, user_id, action, entity, entity_id, summary)
    values (v_ro.workshop_id, auth.uid(), 'invoice.created', 'invoice', v_inv, 'Invoice for RO-' || v_ro.number);
  return v_inv;
end $$;

-- Records a payment; marks the invoice paid and closes the job card when the balance reaches zero.
create or replace function record_payment(p_invoice uuid, p_method payment_method, p_amount bigint, p_reference text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_inv invoices%rowtype;
  v_paid bigint;
begin
  if not has_role('owner', 'advisor', 'cashier') then raise exception 'Not allowed'; end if;
  select * into v_inv from invoices where id = p_invoice and workshop_id = current_workshop_id() for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_inv.status = 'void' then raise exception 'Cannot take payment on a void invoice'; end if;
  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = p_invoice;
  if p_amount <= 0 or p_amount > v_inv.total - v_paid then raise exception 'Amount must be between 1 and the balance due'; end if;

  insert into payments (workshop_id, invoice_id, method, amount, reference, user_id)
    values (v_inv.workshop_id, p_invoice, p_method, p_amount, coalesce(p_reference, ''), auth.uid());
  if v_paid + p_amount = v_inv.total then
    update invoices set status = 'paid' where id = p_invoice;
    update repair_orders set status = 'closed', updated_at = now() where id = v_inv.repair_order_id;
  else
    update invoices set status = 'partial' where id = p_invoice;
  end if;
  insert into audit_log (workshop_id, user_id, action, entity, entity_id, summary)
    values (v_inv.workshop_id, auth.uid(), 'payment.received', 'invoice', p_invoice, v_inv.number || ': ' || p_method || ' payment');
end $$;

-- Voids an unpaid invoice. The number stays used; the job card returns to completed.
create or replace function void_invoice(p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inv invoices%rowtype;
begin
  if not has_role('owner') then raise exception 'Only the owner can void invoices'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Give a reason for voiding'; end if;
  select * into v_inv from invoices where id = p_invoice and workshop_id = current_workshop_id() for update;
  if not found or v_inv.status = 'void' then raise exception 'Invoice not found or already void'; end if;
  if exists (select 1 from payments where invoice_id = p_invoice) then raise exception 'Invoice has payments'; end if;
  update invoices set status = 'void', void_reason = trim(p_reason) where id = p_invoice;
  update repair_orders set status = 'completed', invoice_id = null, updated_at = now() where id = v_inv.repair_order_id;
  insert into audit_log (workshop_id, user_id, action, entity, entity_id, summary)
    values (v_inv.workshop_id, auth.uid(), 'invoice.voided', 'invoice', p_invoice, v_inv.number || ' voided: ' || trim(p_reason));
end $$;

-- Manual stock change (received goods, stock count, damage) with a reason.
create or replace function adjust_stock(p_part uuid, p_qty numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workshop_id();
begin
  if not has_role('owner', 'cashier') then raise exception 'Not allowed'; end if;
  if p_qty = 0 or coalesce(trim(p_note), '') = '' then raise exception 'Quantity and reason are required'; end if;
  update parts set qty_on_hand = qty_on_hand + p_qty where id = p_part and workshop_id = v_ws and qty_on_hand + p_qty >= 0;
  if not found then raise exception 'Part not found or not enough stock'; end if;
  insert into stock_movements (workshop_id, part_id, qty, reason, note, user_id)
    values (v_ws, p_part, p_qty, 'adjustment', trim(p_note), auth.uid());
end $$;
