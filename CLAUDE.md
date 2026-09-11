# MoneyMap — working notes

Single-user personal finance app. One user, one deployment. EUR throughout;
NL/PT merchant patterns in `DEFAULT_RULES` are a starting point, not a fixed
assumption — tune them for whoever's actually using this deployment.

Two ways transactions get in, and either (or both) can be used:
- **Manual CSV upload** (`lib/importers/*.ts`, `app/api/transactions/import`)
  — no registration, no external account. This is the default path for a
  fresh deployment.
- **Live sync via Enable Banking** (PSD2 open banking) — optional, more setup,
  see README. Inert unless `EB_APP_ID`/`EB_PRIVATE_KEY` are set.

## Constraints that are not obvious from the code

- **The bank API (if used) is a sync source, not a query layer.** Banks cap
  transaction fetches at roughly four per account per day. Never call Enable
  Banking from a page render or a user action — only from the cron at
  `/api/sync`. A 429 storm can get the connection suspended at the bank's
  end, and recovering means registering a new app.
- **Consent expires every ~90 days.** Store `valid_until`, warn a week out, and
  make re-authorisation a visible action in the UI. Sync failing silently is the
  worst outcome: stale numbers that look current.
- **Restricted production only returns whitelisted accounts.** If an account is
  missing from a session response, it wasn't linked in the control panel. The
  API returns an empty list, not an error — don't debug this as a code problem.
- **Internal transfers must be stripped before any aggregation.** Moving money
  to savings is neither income nor spending. Counting it double makes every
  savings-rate number wrong. See `markInternalTransfers`.
- **`liquid` is not the same as `savings`.** A fixed-term deposit is savings you
  can't reach. Keep buffer and total separate in every view.
- **The redirect URL is registered externally.** Changing the hostname means
  updating it at enablebanking.com/cp and re-authorising every account.

## Conventions

- `lib/analysis.ts` stays pure — no I/O, no DB. It's the part worth testing, and
  it should run against CSV fixtures without any network.
- Amounts are signed: negative is money leaving. Enable Banking returns
  unsigned strings plus `credit_debit_indicator`; conversion happens once, in
  `toTxn`.
- Transaction IDs prefer `entry_reference`, falling back to a hash of
  account + date + amount + normalised merchant. Never generate a random ID —
  re-syncs overlap by a week and would duplicate.
- Categorisation is rules-first. An LLM is for the uncategorised tail only, and
  its answer gets persisted to `category_rule` so each merchant is paid for once.
- A CSV importer only needs to produce `Txn` objects (`lib/analysis.ts`) —
  everything downstream (categorisation, transfer detection, dedupe) is
  format-agnostic. Set `counterpartyIban` when the export provides one
  (Rabobank does; ING's doesn't) — it makes transfer detection exact instead
  of falling back to amount/date pairing.

## Secrets

`EB_PRIVATE_KEY` is server-only and must never reach the browser or the repo.
If it leaks, the app has to be re-registered from scratch. `AUTH_PASSWORD` is
the only thing standing between this app and anyone who finds the URL — treat
it like a real credential, not a placeholder.

## Current state

Backend, analysis engine, and dashboard UI written. CSV import supports ING
NL and Rabobank NL. Ships with no seeded data — a fresh deployment starts
with an empty database (`db/schema.sql` only seeds the fixed `category`
list, nothing user-specific).
`normaliseMerchant` regexes are untuned guesses at NL/PT bank descriptors —
tune against real statements before trusting any report.
