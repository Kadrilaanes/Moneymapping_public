-- You must persist transactions locally. Banks cap transaction fetches at
-- roughly 4 per account per day, and sessions die every ~90 days, so the API
-- is a sync source, not a query layer. Your app always reads from this DB.

-- Short-lived CSRF guard for the bank consent redirect round-trip.
create table auth_state (
  state       text primary key,
  bank        text,
  country     text,
  created_at  timestamptz not null default now()
);

create table bank_session (
  id                text primary key,          -- Enable Banking session_id
  aspsp_name        text not null,
  aspsp_country     text not null,
  valid_until       timestamptz not null,
  status            text not null default 'AUTHORIZED',
  created_at        timestamptz not null default now()
);

create table account (
  id                text primary key,          -- identification_hash, or 'manual-<uuid>' for unsynced accounts
  session_id        text references bank_session(id) on delete set null, -- null = manually tracked, not bank-synced
  uid               text,                      -- per-session UID; refreshed on re-consent
  name              text,
  iban              text,
  type              text not null,             -- current | savings | investment | card | other
  liquid            boolean not null default true,
  balance           numeric(14,2),
  currency          text not null,
  balance_synced_at timestamptz,
  interest_rate     numeric(6,3),              -- annual %, for savings accounts with a known yield
  accrued_interest  numeric(14,2)              -- running total interest earned so far, if tracked
);

-- Individual stock positions inside an `investment` account. The account's
-- own `balance` stays the manually-set fallback; when an account has
-- holdings, the dashboard shows shares × live price instead.
create table holding (
  id          serial primary key,
  account_id  text not null references account(id) on delete cascade,
  ticker      text not null,
  shares      numeric(18,8) not null,    -- high precision: fractional-share investing (Revolut etc.)
  cost_basis  numeric(14,2)              -- optional: total paid, for a gain/loss figure
);

create table transaction (
  id                  text primary key,        -- entry_reference, else hash of the fields below
  account_id          text not null references account(id) on delete cascade,
  booking_date        date not null,
  amount              numeric(14,2) not null,  -- signed; negative = out
  currency            text not null,
  counterparty        text,
  counterparty_iban   text,
  description         text,
  mcc                 text,
  category            text,
  is_internal_transfer boolean not null default false,
  raw                 jsonb not null,          -- keep the original; you WILL want it
  imported_at         timestamptz not null default now()
);

create index on transaction (account_id, booking_date desc);
create index on transaction (booking_date desc);
create index on transaction (category);

-- Every category has an explicit kind, so the dashboard never has to guess
-- from a name string whether "Freelance" is income or "Credit card payment"
-- is a transfer. `expense` categories are the only ones that count as
-- spending; `income` and `transfer` are both excluded from that view.
create table category (
  name  text primary key,
  kind  text not null check (kind in ('income', 'expense', 'transfer'))
);

insert into category (name, kind) values
  ('Groceries', 'expense'), ('Eating out', 'expense'), ('Transport', 'expense'),
  ('Housing', 'expense'), ('Utilities', 'expense'), ('Health', 'expense'),
  ('Childcare', 'expense'), ('Subscriptions', 'expense'), ('Shopping', 'expense'),
  ('Cash withdrawal', 'expense'), ('Entertainment', 'expense'),
  ('Credit card bill', 'expense'), ('Insurance', 'expense'), ('Uncategorised', 'expense'),
  ('Income', 'income'), ('Other income', 'income'),
  ('Internal transfer', 'transfer'), ('Investing', 'transfer')
on conflict (name) do nothing;

-- Learned categorisations. When you correct a category in the UI, write the
-- rule here so the same merchant is never miscategorised twice.
create table category_rule (
  id          serial primary key,
  pattern     text not null unique, -- matched against the normalised merchant
  mcc         text,
  category    text not null,
  priority    int not null default 100,
  source      text not null default 'user'  -- user | seed | llm
);

create table goal (
  id                serial primary key,
  year              int not null unique,
  target_amount     numeric(14,2) not null,
  currency          text not null default 'EUR',
  created_at        timestamptz not null default now()
);

-- Optional: a monthly snapshot so you can chart real progress rather than
-- recomputing history from balances that only ever show "now".
create table balance_snapshot (
  account_id  text not null references account(id) on delete cascade,
  taken_on    date not null,
  balance     numeric(14,2) not null,
  primary key (account_id, taken_on)
);
