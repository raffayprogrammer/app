-- Email invoices to customers through the workshop's own Gmail account.

-- The Google refresh token for each workshop's connected Gmail.
-- RLS is on with no policies: only the server (secret key) can read or write it,
-- so the token never reaches a browser.
create table workshop_email_accounts (
  workshop_id   uuid primary key references workshops (id),
  email         text not null,
  refresh_token text not null,
  connected_by  uuid references profiles (id),
  connected_at  timestamptz not null default now()
);
alter table workshop_email_accounts enable row level security;
revoke all on workshop_email_accounts from anon, authenticated;
grant all on workshop_email_accounts to service_role;

-- Every invoice email that was sent (shown on the invoice page). Written by the server only.
create table invoice_emails (
  id          uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references workshops (id),
  invoice_id  uuid not null references invoices (id),
  to_email    text not null,
  from_email  text not null,
  sent_by     uuid references profiles (id),
  sent_at     timestamptz not null default now()
);
create index on invoice_emails (invoice_id);
alter table invoice_emails enable row level security;
create policy "read invoice emails" on invoice_emails for select
  using (workshop_id = (select current_workshop_id()) and (select has_role('owner', 'advisor', 'cashier')));
revoke all on invoice_emails from anon;
grant select on invoice_emails to authenticated;
grant all on invoice_emails to service_role;
