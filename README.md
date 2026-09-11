# MoneyMap

A personal finance dashboard for one person. Upload bank statement exports
(no live bank connection required), and it categorises spending, finds
recurring charges, and tracks a year-end savings target — all read from your
own Postgres database, nothing sent anywhere else.

Ships empty: no seeded accounts, transactions, or categorisation rules.
Everything below builds up from a fresh database.

## Quick start (statement upload — no bank registration needed)

1. **Database.** Provision a Postgres instance (Vercel Postgres, Supabase,
   Neon, or your own), then run:
   ```bash
   psql $DATABASE_URL -f db/schema.sql
   ```
2. **Env.** Copy `.env.example` to `.env` and set:
   ```
   DATABASE_URL=postgres://...
   AUTH_PASSWORD=<a long random string — this gates the whole app>
   ```
   Leave the `EB_*` variables unset — they're only needed for the optional
   live bank sync below.
3. **Run it.**
   ```bash
   npm install
   npm run dev
   ```
4. **Add an account.** Settings → "Register a manual account" to create an
   account to import into, then Settings → "Import transactions from CSV" to
   upload a statement export. Supported formats today:
   - **ING NL** — the "alle mutaties" CSV export
   - **Rabobank NL** — the CSV account export from "Mijn bankzaken"

   Re-uploading the same file is safe; already-imported transactions are
   skipped, not duplicated.
5. **Tune categorisation.** `lib/analysis.ts`'s `DEFAULT_RULES` are generic
   NL/PT merchant patterns — a starting point, not a finished set. Correcting
   a category in the UI writes a rule to `category_rule` so the same
   merchant is never wrong twice (see `lib/rules.ts`).
6. **Set a savings goal** by inserting into the `goal` table:
   ```sql
   insert into goal (year, target_amount, currency) values (2026, 10000, 'EUR');
   ```

## Architecture

```
CSV upload  ──▶  Postgres  ──▶  Next.js dashboard
     ▲
     └── optional: Enable Banking API (cron sync) ──┘
```

The database is always the source of truth — the UI never reads from a bank
API or a CSV directly. `lib/analysis.ts` is pure functions (categorisation,
transfer detection, recurring detection, goal maths) with no I/O, so it's
testable against fixtures.

| File | What it does |
|---|---|
| `lib/importers/*.ts` | One CSV parser per supported bank export format. |
| `app/api/transactions/import` | Manual statement upload — parses, categorises, dedupes. |
| `lib/analysis.ts` | Pure functions: categorisation, transfer detection, recurring detection, goal maths. No I/O — test it against CSV fixtures. |
| `db/schema.sql` | Postgres schema. |
| `lib/enablebanking.ts` | Optional live bank sync. Server-only, unused unless configured (see below). |

## Adding another bank's CSV format

Add a parser in `lib/importers/<bank-id>.ts` exporting `parse<Bank>Csv(text,
accountId)` and `csvAccountInfo(text)` (see `lib/importers/rabo-nl.ts` for the
shape), then register it in the `IMPORTERS` map in
`app/api/transactions/import/route.ts` and add it to the `BANK_FORMATS` list
in `app/settings/ImportForm.tsx`.

## Optional: live bank sync via Enable Banking

Instead of (or alongside) manual CSV upload, accounts can sync automatically
via [Enable Banking](https://enablebanking.com)'s PSD2 open-banking API. This
is more setup and not required to use the app.

1. **Register at** `enablebanking.com/cp/applications`. Choose **PRODUCTION**,
   not sandbox — apps cannot be moved between environments later.
2. **Generate the keypair.** Either let the control panel generate in-browser
   and export, or:
   ```bash
   openssl genrsa -out private.key 4096
   openssl req -new -x509 -days 3650 -key private.key -out public.crt \
     -subj "/O=Personal/CN=moneymap.local"
   ```
3. **Set the redirect URL** to `https://<your-app>/api/auth/callback`.
   Production requires HTTPS.
4. **Activate by linking your accounts.** The app starts *Inactive*. Hit
   "Activate by linking accounts" in the control panel and authorise each
   account. In restricted mode, an account you didn't explicitly whitelist is
   silently stripped from API responses — not an error, just missing.
5. **Env**, in addition to the quick-start vars above:
   ```
   EB_APP_ID=<uuid from registration>
   EB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
   APP_URL=https://your-app.example
   CRON_SECRET=<separate long random string — lets the cron call /api/sync
                without the login cookie>
   ```
   The key must be PKCS#8. If `openssl` gave you `BEGIN RSA PRIVATE KEY`,
   convert: `openssl pkcs8 -topk8 -nocrypt -in private.key -out private.pk8`
6. Add the CSRF table:
   ```sql
   create table auth_state (state text primary key, bank text, country text, created_at timestamptz);
   ```
7. `npm i jose pg` and point `lib/db.ts` at a `pg` Pool (already wired up).

### Things that will bite you if you turn this on

- **Consent expiry.** 90 days at most, often less. Store `valid_until` and
  warn a week out — this is already built into Settings.
- **Rate limits.** Sync on a cron (`vercel.json` already schedules
  `/api/sync`), never on page load. A 429 storm can get the connection
  suspended at the bank's end, and recovering means a new app.
- **Internal transfers.** Moving money to savings is neither income nor
  spending. `markInternalTransfers` handles it by IBAN first, then
  amount/date pairing for banks (or CSV formats) that don't give a
  counterparty IBAN.
- **Locked savings.** A fixed-term deposit is savings but not buffer — that's
  what the `liquid` flag on an account is for.
- **Merchant strings are chaos.** `normaliseMerchant` is the highest-leverage
  function in the codebase. Tune its regexes against real statements before
  trusting any report.

## Deploying

Any Node host works; `vercel.json` is set up for Vercel specifically (cron +
`POSTGRES_URL` support in `lib/db.ts`). Set the env vars above in your host's
dashboard — none of them belong in the repo.
