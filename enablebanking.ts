/**
 * Enable Banking API client.
 *
 * Auth model: you sign an RS256 JWT yourself with your app's private RSA key.
 * There is no token endpoint and no refresh token — you mint a fresh short-lived
 * JWT per request (or cache one for a few minutes). Max TTL is 24h.
 *
 * The private key must NEVER reach the browser. Everything here is server-only.
 */

import { SignJWT, importPKCS8 } from "jose";

const API = "https://api.enablebanking.com";

let cached: { token: string; expires: number } | null = null;

// Read lazily, not at module load: Next.js imports route modules to collect
// config at build time, and a build shouldn't require runtime secrets.
async function jwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expires > now + 60) return cached.token;

  const appId = process.env.EB_APP_ID!;
  const privateKeyPem = process.env.EB_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const key = await importPKCS8(privateKeyPem, "RS256");
  const exp = now + 3600;

  const token = await new SignJWT({})
    .setProtectedHeader({ typ: "JWT", alg: "RS256", kid: appId })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);

  cached = { token, expires: exp };
  return token;
}

async function call<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const { query, ...rest } = init;
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    ...rest,
    headers: {
      Authorization: `Bearer ${await jwt()}`,
      Accept: "application/json",
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    // 429 here is usually the bank's own daily cap (often ~4 transaction
    // fetches per account per day), not Enable Banking throttling you.
    throw new Error(`Enable Banking ${res.status} on ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------

export type Aspsp = {
  name: string;
  country: string;
  logo: string;
  maximum_consent_validity: number; // seconds
  beta: boolean;
  psu_types: string[];
  required_psu_headers?: string[];
};

export function listBanks(country: string) {
  return call<{ aspsps: Aspsp[] }>("/aspsps", {
    query: { country, psu_type: "personal" },
  }).then((r) => r.aspsps);
}

/**
 * Step 1 of the consent flow. Returns a URL to send yourself to; you log in at
 * your bank, and land back on `redirectUrl` with `?code=...&state=...`.
 *
 * `validUntil` is capped by the bank's maximum_consent_validity. Ask for the
 * maximum the bank allows — re-consenting is the most annoying part of PSD2 and
 * many banks cap at 90 days regardless.
 */
export function startAuth(opts: {
  bank: string;
  country: string;
  redirectUrl: string;
  state: string;
  validUntil: Date;
}) {
  return call<{ url: string; authorization_id: string }>("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: {
        valid_until: opts.validUntil.toISOString(),
        balances: true,
        transactions: true,
      },
      aspsp: { name: opts.bank, country: opts.country },
      state: opts.state,
      redirect_url: opts.redirectUrl,
      psu_type: "personal",
    }),
  });
}

export type SessionAccount = {
  uid: string; // use this for balance/transaction calls; dies with the session
  identification_hash: string; // stable across sessions — use as your own PK
  account_id?: { iban?: string };
  name?: string;
  product?: string;
  currency: string;
  cash_account_type: "CACC" | "CARD" | "CASH" | "LOAN" | "OTHR" | "SVGS";
};

/** Step 2: exchange the `code` from the callback for a session. */
export function createSession(code: string) {
  return call<{
    session_id: string;
    accounts: SessionAccount[];
    aspsp: { name: string; country: string };
    access: { valid_until: string };
  }>("/sessions", { method: "POST", body: JSON.stringify({ code }) });
}

export function getSession(sessionId: string) {
  return call<{
    status: "AUTHORIZED" | "EXPIRED" | "REVOKED" | string;
    access: { valid_until: string };
    accounts: string[];
  }>(`/sessions/${sessionId}`);
}

export type Balance = {
  name: string;
  balance_amount: { currency: string; amount: string };
  balance_type: string; // CLBD = booked, ITAV = interim available, etc.
  reference_date?: string;
};

export function getBalances(accountUid: string) {
  return call<{ balances: Balance[] }>(`/accounts/${accountUid}/balances`).then(
    (r) => r.balances,
  );
}

export type EbTransaction = {
  entry_reference?: string;
  transaction_id?: string;
  transaction_amount: { currency: string; amount: string };
  credit_debit_indicator: "CRDT" | "DBIT";
  status: "BOOK" | "PDNG" | string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  creditor?: { name?: string };
  creditor_account?: { iban?: string };
  debtor?: { name?: string };
  debtor_account?: { iban?: string };
  merchant_category_code?: string;
  remittance_information?: string[];
  bank_transaction_code?: { description?: string; code?: string };
};

/** Pages through transactions via continuation_key until exhausted. */
export async function getTransactions(
  accountUid: string,
  dateFrom: string,
  dateTo?: string,
): Promise<EbTransaction[]> {
  const out: EbTransaction[] = [];
  let continuation: string | undefined;

  do {
    const page = await call<{
      transactions: EbTransaction[];
      continuation_key?: string;
    }>(`/accounts/${accountUid}/transactions`, {
      query: {
        date_from: dateFrom,
        date_to: dateTo,
        continuation_key: continuation,
        transaction_status: "BOOK",
      },
    });
    out.push(...page.transactions);
    continuation = page.continuation_key;
  } while (continuation);

  return out;
}
