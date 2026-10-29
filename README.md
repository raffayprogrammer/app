# WorkshopPOS

End-to-end point of sale and job card system for car workshops: check a car in, build an estimate, get each job approved, track the work, take parts out of stock, invoice, take payment and print a receipt.

Built as a multi-workshop product: each workshop signs up and only ever sees its own data.

> **Current stage: Phase 0 + Phase 1 on Supabase** (Postgres + Auth). Every workshop's data is isolated by row-level security.

## Set up

1. Create a Supabase project. In **SQL Editor**, paste and run `supabase/migrations/0001_init.sql`.
2. Copy `.env.example` to `.env.local` and fill in the project URL, publishable key and secret key.
3. Install and run:

```bash
npm install
npm run seed:demo   # optional: creates the demo workshop and its 5 logins
npm run dev         # http://localhost:3000
```

Sign in with one of the demo accounts on the login page (password `demo123`):

| Account | Role | Sees |
|---|---|---|
| owner@demo.pk | Owner | Everything, including settings, team, activity log, voiding invoices |
| advisor@demo.pk | Service Advisor | Job Board, job cards, customers, invoices, payments |
| cashier@demo.pk | Cashier / Storekeeper | Invoices, payments, stock, reports |
| tech@demo.pk | Technician | Only "My Work": their own cars, no prices |

Or click **Create an account** to set up a brand-new workshop.

## Demo walkthrough

1. **New job card** → search a plate or customer → pick the car → enter the complaint and odometer.
2. Add jobs: type one, or pick a **canned job** (e.g. *Oil change – Corolla* adds labour + oil + filter in one click). Add labour, parts (from stock) or fees / outside work.
3. **Print estimate**, then mark each job **Approved** or **Declined**. The first approval moves the card to *Work in progress* on the Job Board.
4. The technician ticks jobs off in **My Work** and sets labels such as *Waiting on parts*.
5. **Complete work** → approved parts come out of stock automatically.
6. **Create invoice** → numbered in sequence (`INV-000003`), totals frozen.
7. **Take payment** → cash (with change), card, bank, JazzCash, Easypaisa; partial and split payments supported. Fully paid closes the job card.
8. **Print** → A4 invoice or 80mm / 58mm thermal receipt. Or connect a receipt printer directly in **Settings → Printer**.

## What's in Phase 0 + 1

- Workshop sign-up, logins, 4 roles with permissions enforced in the data layer (not just hidden buttons)
- Customers (individual / company with NTN) and vehicles, plate search from anywhere
- Parts inventory: on hand / reserved / available, low-stock alerts, stock adjustments with reasons, movement history
- Job cards: jobs made of labour + parts + fees, per-job approval, status workflow, technician assignment, promised time, discount (permission-controlled)
- Job Board (Kanban) grouped by status or technician
- Invoices: sequential numbering that never reuses a number, void (owner only, unpaid only) instead of delete
- Payments: 6 methods, partial and split, cash change calculator
- Tax: parts and services taxed separately (federal sales tax on parts, services tax ready for provincial rates)
- Printing: A4 invoice / estimate, thermal receipt via browser, and direct ESC/POS printing over Web Serial (Chrome / Edge)
- Dashboard, reports (sales, collections by method, technician productivity, top parts), CSV export
- Activity log of every change
- Declined work kept per customer to offer again next visit

## Project structure

```
src/
  app/
    (app)/            signed-in screens (dashboard, board, repair-orders, customers, vehicles,
                      inventory, invoices, reports, settings, my-work)
    login/ signup/    auth screens
    print/            printable invoice / estimate pages (no app chrome)
  components/         UI kit, app shell, forms, invoice document, thermal receipt
  lib/
    types.ts          domain model (mirrors the SQL tables)
    store.ts          data layer: actions that read/write Supabase
    supabase/         browser client + row mapping
    calc.ts           totals, tax, stock reservation (mirrored in SQL issue_invoice)
    permissions.ts    role → permission map
    printer.ts        Web Serial + ESC/POS receipt builder
    seed.ts, demo.ts  demo workshop data (loaded by scripts/seed-demo.ts)
supabase/migrations/  database schema with row-level security
scripts/seed-demo.ts  creates the demo workshop in Supabase
```

## Database (Supabase)

`supabase/migrations/0001_init.sql`:

- Every table has `workshop_id`; row-level security limits each user to their own workshop. Technicians can't read invoices or payments, and only see job cards assigned to them.
- Money is integer paisa; invoices, payments, stock movements and the activity log can't be deleted.
- Workflow steps are SQL functions that run in one transaction: `create_workshop`, `open_repair_order`, `set_job_approval`, `set_job_done`, `set_ro_label`, `complete_repair_order`, `reopen_repair_order`, `cancel_repair_order`, `issue_invoice` (computes totals server-side, gap-free numbering), `record_payment`, `void_invoice`, `adjust_stock`.
- Guard triggers stop direct edits to statuses, numbers and stock, and stop changes to closed job cards.

The browser talks to Supabase with the publishable key and the user's session. Creating staff logins needs the secret key, so it runs in a server action (`src/app/actions/team.ts`).

## Deploy

Push to GitHub and import the repo in Vercel. Add the variables from `.env.example` in Vercel → Settings → Environment Variables. In Supabase → Authentication → URL Configuration, set the Site URL to your Vercel domain so confirmation emails link back to the app.

## Coming next

- **Phase 2:** technician tablet inspections with photos, WhatsApp estimate approval links, service reminders, technician job clock
- **Phase 3:** suppliers & purchase orders, credit/fleet accounts, credit notes, appointments calendar, owner KPIs
- **Phase 4:** FBR POS integration, online payments, accounting sync, provincial tax rules, multi-branch
