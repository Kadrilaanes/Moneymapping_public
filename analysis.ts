/**
 * The analysis engine. Pure functions over normalised transactions — no I/O,
 * so this is trivially testable and you can run it against CSV fixtures before
 * you ever connect a real bank.
 */

export type Txn = {
  id: string; // stable dedupe key
  accountId: string; // your identification_hash
  date: string; // YYYY-MM-DD (booking date)
  amount: number; // signed: negative = money out
  currency: string;
  counterparty: string; // raw name as the bank gave it
  counterpartyIban?: string;
  description: string;
  mcc?: string;
  category?: string;
  isInternalTransfer?: boolean;
};

export type Account = {
  id: string;
  name: string;
  iban?: string;
  type: "current" | "savings" | "investment" | "card" | "other";
  /** Savings you can reach today. Locked deposits (e.g. a 3-month fixed term)
   *  should be `liquid: false` so the buffer view doesn't lie to you. */
  liquid: boolean;
  balance: number;
  currency: string;
  /** Annual yield %, for savings accounts with a known rate. Not simulated —
   *  just displayed; the balance itself is still the source of truth. */
  interestRate?: number;
  accruedInterest?: number;
  /** When `accruedInterest` was last true — the UI ticks live from this point. */
  balanceSyncedAt?: string;
};

// --- normalisation ---------------------------------------------------------

/**
 * Bank descriptors are noisy: "SumUp *CAFE LISBOA 240517", "CONTINENTE
 * MAT 4471 ALMADA". Strip the varying parts so the same merchant collapses to
 * one key. Tune the regexes against your own statements — this is the part
 * that decides whether your reports are useful or mush.
 */
export function normaliseMerchant(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b\d{2}[-/.]\d{2}([-/.]\d{2,4})?\b/g, " ") // dates
    .replace(/\b[a-z]{2}\d{2}[a-z0-9]{10,30}\b/g, " ") // IBANs
    .replace(/\b\d{4,}\b/g, " ") // long digit runs (terminal/card refs)
    .replace(/\b(pagamento|compra|betaling|payment|card|contactless|mb way|ideal|sepa|incasso)\b/g, " ")
    .replace(/[*#|,.\-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- internal transfers ----------------------------------------------------

/**
 * Moving €500 from current to savings is not income and not spending. If you
 * don't strip these, every report is wrong and your "savings rate" counts the
 * same euro twice.
 *
 * Two passes: exact IBAN match against your own accounts (reliable), then
 * amount+date pairing for banks that don't return counterparty IBANs.
 */
export function markInternalTransfers(txns: Txn[], accounts: Account[]): Txn[] {
  const ownIbans = new Set(
    accounts.map((a) => a.iban?.replace(/\s/g, "").toUpperCase()).filter(Boolean) as string[],
  );

  const marked = txns.map((t) => ({
    ...t,
    isInternalTransfer:
      !!t.counterpartyIban &&
      ownIbans.has(t.counterpartyIban.replace(/\s/g, "").toUpperCase()),
  }));

  // Pairing fallback: a debit on account A and a credit on account B, same
  // absolute amount, within 3 days, neither already matched.
  const unmatched = marked.filter((t) => !t.isInternalTransfer);
  const credits = unmatched.filter((t) => t.amount > 0);

  for (const debit of unmatched.filter((t) => t.amount < 0)) {
    const partner = credits.find(
      (c) =>
        !c.isInternalTransfer &&
        c.accountId !== debit.accountId &&
        Math.abs(c.amount + debit.amount) < 0.01 &&
        Math.abs(daysBetween(c.date, debit.date)) <= 3,
    );
    if (partner) {
      debit.isInternalTransfer = true;
      partner.isInternalTransfer = true;
    }
  }

  return marked;
}

// --- categorisation --------------------------------------------------------

/**
 * Rules run in order; first match wins. MCC is checked before text because
 * it comes from the card network and doesn't vary by merchant naming.
 *
 * Start with rules, not an LLM. Rules are deterministic, free, and instant;
 * send only the leftover "uncategorised" tail to a model, then persist the
 * answer as a new rule so you pay for each merchant once.
 */
export type Rule = { category: string; mcc?: string[]; match?: RegExp };

export const DEFAULT_RULES: Rule[] = [
  { category: "Groceries", mcc: ["5411", "5422", "5451", "5499"] },
  { category: "Groceries", match: /continente|pingo doce|lidl|aldi|mercadona|albert heijn|jumbo|auchan|intermarch|flink b ?v/ },
  { category: "Eating out", mcc: ["5812", "5813", "5814"] },
  { category: "Transport", mcc: ["4111", "4121", "4131", "5541", "5542"] },
  // note: normaliseMerchant turns hyphens into spaces, so match the
  // post-normalisation form ("ov chipkaart"), never the raw "ov-chipkaart".
  { category: "Transport", match: /uber|bolt|cp comboios|carris|ns |ov chipkaart|ovpay|ponte 25 de abril|galp|bp |repsol/ },
  // \brent\b, not bare "rent" — the latter matches inside "Recurrent SEPA
  // direct debit", the boilerplate that appears in nearly every SEPA direct
  // debit description regardless of what it's actually for. That collision
  // was silently dumping unrelated direct debits (insurance, childcare,
  // subscriptions) into Housing.
  { category: "Housing", match: /renda|\brent\b|hipotec|mortgage|hypothe|condominio/ },
  { category: "Utilities", match: /edp|galp energia|epal|meo|nos |vodafone|nowo|eneco|vattenfall|waterleiding|pwn |vitens|dunea|evides|waternet|simyo|odido|\bkpn\b|t-mobile/ },
  { category: "Health", mcc: ["8011", "8021", "8062", "5912"] },
  { category: "Health", match: /tandarts|mondzorg|apotheek|zorgverzekering|unive zorg/ },
  { category: "Childcare", match: /creche|infant|kinderopvang|escola|jardim de inf|kidskonnect|gastouder|freekids/ },
  { category: "Subscriptions", match: /netflix|spotify|icloud|google one|adobe|github|figma|patreon|disney/ },
  { category: "Shopping", match: /amazon|bol com/ },
  { category: "Entertainment", match: /tiqets|ticketmaster|eventbrite|staatsloterij|nederlandse loterij/ },
  { category: "Insurance", match: /centraal beheer/ },
  { category: "Cash withdrawal", mcc: ["6011"], match: /geldmaat/ },
  { category: "Income", match: /salari|salaris|vencimento|payroll|loon/ },
];

export function categorise(t: Txn, rules: Rule[] = DEFAULT_RULES): string {
  const haystack = normaliseMerchant(`${t.counterparty} ${t.description}`);
  for (const r of rules) {
    if (r.mcc && t.mcc && r.mcc.includes(t.mcc)) return r.category;
    if (r.match && r.match.test(haystack)) return r.category;
  }
  return t.amount > 0 ? "Other income" : "Uncategorised";
}

// --- recurring / subscription detection ------------------------------------

export type Recurring = {
  merchant: string;
  direction: "in" | "out";
  cadence: "weekly" | "monthly" | "quarterly" | "yearly";
  typicalAmount: number;
  /** The single most recent occurrence — for projecting forward, this beats
   *  `typicalAmount` whenever the amount has a real trend (a raise, a
   *  childcare-benefit recalculation) rather than just noise around a mean. */
  lastAmount: number;
  annualCost: number;
  occurrences: number;
  lastSeen: string;
  /** Amount has crept up over the observed period — the silent price rise. */
  priceIncrease?: { from: number; to: number };
  /** No charge in over 1.5 cadences. Either cancelled, or about to surprise you. */
  dormant: boolean;
};

const CADENCES: [Recurring["cadence"], number, number, number][] = [
  // label, minGap, maxGap, chargesPerYear
  ["weekly", 6, 8, 52],
  ["monthly", 26, 35, 12],
  ["quarterly", 85, 96, 4],
  ["yearly", 355, 375, 1],
];

export function findRecurring(
  txns: Txn[],
  today = new Date(),
  direction: "in" | "out" = "out",
): Recurring[] {
  const groups = new Map<string, Txn[]>();

  for (const t of txns) {
    if (t.isInternalTransfer) continue;
    if (direction === "out" ? t.amount >= 0 : t.amount <= 0) continue;
    const key = normaliseMerchant(t.counterparty || t.description);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  const out: Recurring[] = [];

  for (const [merchant, group] of groups) {
    if (group.length < 3) continue;
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i].date, sorted[i - 1].date));
    }
    const gap = median(gaps);

    const cadence = CADENCES.find(([, lo, hi]) => gap >= lo && gap <= hi);
    if (!cadence) continue;

    const amounts = sorted.map((t) => Math.abs(t.amount));
    // A real subscription is stable in size. Groceries at the same shop every
    // week are regular but the amount swings — this filter is what separates
    // "subscription" from "habit". Salary needs a much looser bar: bonuses,
    // overtime, and holiday allowance routinely swing a real paycheque by
    // 30%+ month to month without it being any less "recurring."
    //
    // Median-based (MAD/median), not stdev/mean: the same payer often mixes
    // in a genuine one-off — a tax authority paying monthly childcare
    // allowance also issues an annual refund 10x the size. A single such
    // outlier blows up stdev enough to hide an otherwise rock-steady pattern;
    // the median-based measure barely notices it.
    const maxVariance = direction === "in" ? 0.5 : 0.15;
    if (mad(amounts) / median(amounts) > maxVariance) continue;

    const [label, , , perYear] = cadence;
    const typical = median(amounts);
    const first = median(amounts.slice(0, Math.max(2, Math.floor(amounts.length / 3))));
    const recent = median(amounts.slice(-Math.max(2, Math.floor(amounts.length / 3))));
    const lastSeen = sorted[sorted.length - 1].date;

    out.push({
      merchant,
      direction,
      cadence: label,
      typicalAmount: typical,
      lastAmount: amounts[amounts.length - 1],
      annualCost: typical * perYear,
      occurrences: sorted.length,
      lastSeen,
      priceIncrease:
        recent > first * 1.08 ? { from: round(first), to: round(recent) } : undefined,
      dormant: daysBetween(iso(today), lastSeen) > gap * 1.5,
    });
  }

  return out.sort((a, b) => b.annualCost - a.annualCost);
}

export type IncomeProjection = {
  month: string; // YYYY-MM
  total: number;
  sources: { merchant: string; amount: number; cadence: Recurring["cadence"] }[];
};

const OCCURRENCES_PER_YEAR: Record<Recurring["cadence"], number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

/**
 * Recurring income sources (salary, benefits), each reduced to a flat
 * monthly-equivalent rather than an exact pay date — "roughly what lands
 * most months," not a payroll calendar. Built from `lastAmount`, the most
 * recent occurrence, not the historical `typicalAmount` median: a raise or a
 * childcare-benefit recalculation should show up in next month's projection
 * immediately, not get averaged away against months before it took effect.
 * Dormant sources (nothing seen in over 1.5 cadences — likely a job change)
 * are excluded, since projecting income from a job you no longer have is
 * worse than showing nothing.
 */
function recurringIncomeSources(
  txns: Txn[],
  today: Date,
): { merchant: string; amount: number; cadence: Recurring["cadence"] }[] {
  return findRecurring(txns, today, "in")
    .filter((r) => !r.dormant)
    .map((s) => ({
      merchant: s.merchant,
      amount: round((s.lastAmount * OCCURRENCES_PER_YEAR[s.cadence]) / 12),
      cadence: s.cadence,
    }));
}

/** Total expected recurring income for a single month — see recurringIncomeSources. */
export function expectedMonthlyIncome(txns: Txn[], today = new Date()): number {
  return round(sum(recurringIncomeSources(txns, today).map((s) => s.amount)));
}

/**
 * The same monthly-equivalent income, projected forward — useful for seeing
 * which sources make up the total, not just the number.
 */
export function projectIncome(
  txns: Txn[],
  monthsAhead: number,
  today = new Date(),
): IncomeProjection[] {
  const sources = recurringIncomeSources(txns, today);

  const out: IncomeProjection[] = [];
  for (let i = 1; i <= monthsAhead; i++) {
    const m = today.getMonth() + i;
    const year = today.getFullYear() + Math.floor(m / 12);
    const month = `${year}-${String((m % 12) + 1).padStart(2, "0")}`;
    out.push({ month, total: round(sum(sources.map((s) => s.amount))), sources });
  }
  return out;
}

// --- cashflow + goal -------------------------------------------------------

export type Cashflow = {
  month: string; // YYYY-MM
  income: number;
  spending: number;
  net: number;
  byCategory: Record<string, number>;
};

export function monthlyCashflow(txns: Txn[]): Cashflow[] {
  const months = new Map<string, Cashflow>();

  for (const t of txns) {
    if (t.isInternalTransfer) continue;
    const month = t.date.slice(0, 7);
    const m =
      months.get(month) ??
      months.set(month, { month, income: 0, spending: 0, net: 0, byCategory: {} }).get(month)!;

    if (t.amount > 0) m.income += t.amount;
    else m.spending += -t.amount;

    const cat = t.category ?? "Uncategorised";
    m.byCategory[cat] = round((m.byCategory[cat] ?? 0) + Math.abs(t.amount));
  }

  for (const m of months.values()) {
    m.income = round(m.income);
    m.spending = round(m.spending);
    m.net = round(m.income - m.spending);
  }

  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export type GoalStatus = {
  target: number;
  saved: number;
  liquidSaved: number;
  monthsLeft: number;
  requiredPerMonth: number;
  actualPerMonth: number;
  /** Interest expected to accrue on savings accounts (with a known rate)
   *  over the remaining months — already folded into `projected`. Simple,
   *  non-compounding estimate; investment accounts are never included here,
   *  their value isn't a yield you can project. */
  projectedInterest: number;
  projected: number;
  gap: number; // negative = short
  onTrack: boolean;
  /** What you'd need to trim each month to close the gap. */
  shortfallPerMonth: number;
};

/**
 * `actualPerMonth` averages every *completed* month since January of the
 * goal's year — not a short trailing window. A 3-month trailing average
 * swings wildly on a single rough month (an annual insurance bill, a big
 * one-off) and makes the whole year's projection look unrealistic off one
 * bad quarter; averaging since January is the number that actually reflects
 * "how this year is going." The current partial month is always excluded —
 * including it drags the number down and makes every check-in early in the
 * month look like a disaster.
 */
export function goalStatus(
  target: number,
  accounts: Account[],
  cashflow: Cashflow[],
  today = new Date(),
): GoalStatus {
  const savingsAccounts = accounts.filter((a) => a.type === "savings");
  const saved = sum(savingsAccounts.map((a) => a.balance));
  const liquidSaved = sum(savingsAccounts.filter((a) => a.liquid).map((a) => a.balance));

  const year = String(today.getFullYear());
  const currentMonth = iso(today).slice(0, 7);
  const completed = cashflow.filter((c) => c.month.startsWith(year) && c.month < currentMonth);
  const actualPerMonth = completed.length ? round(mean(completed.map((c) => c.net))) : 0;

  // Months remaining including the current one.
  const monthsLeft = 12 - today.getMonth();
  const requiredPerMonth = round((target - saved) / Math.max(monthsLeft, 1));

  // Simple (non-compounding) interest on top of each account's current
  // balance — close enough over a few months, and the balance itself will
  // catch up to reality next time it's synced or updated by hand.
  const projectedInterest = sum(
    savingsAccounts
      .filter((a) => a.interestRate)
      .map((a) => (a.balance * (a.interestRate! / 100) / 12) * monthsLeft),
  );
  const projected = round(saved + actualPerMonth * monthsLeft + projectedInterest);

  return {
    target,
    saved: round(saved),
    liquidSaved: round(liquidSaved),
    monthsLeft,
    requiredPerMonth,
    projectedInterest: round(projectedInterest),
    actualPerMonth,
    projected,
    gap: round(projected - target),
    onTrack: projected >= target,
    shortfallPerMonth: round(Math.max(0, requiredPerMonth - actualPerMonth)),
  };
}

export type MonthProjection = { month: string; cumulative: number };

/**
 * "If I set aside €X every month" — a flat hypothetical, not the trailing
 * actual average `goalStatus` uses. That average reflects real (often messy)
 * history; this answers a different question: what would a chosen monthly
 * amount add up to by year-end, starting from what's saved today.
 *
 * Takes `monthsLeft`/`year` rather than defaulting to `new Date()` — this
 * gets called from a client component, and the server's clock and the
 * browser's clock can disagree right at a month boundary, which would make
 * the two renders produce a different number of months and fail hydration.
 * Callers should reuse the same `monthsLeft` `goalStatus` already computed.
 */
export function projectFlatSavings(
  saved: number,
  monthlyAmount: number,
  monthsLeft: number,
  year: number,
): MonthProjection[] {
  const out: MonthProjection[] = [];
  let cumulative = saved;
  const startMonth = 12 - monthsLeft; // 0-indexed
  for (let m = startMonth; m <= 11; m++) {
    cumulative += monthlyAmount;
    out.push({ month: `${year}-${String(m + 1).padStart(2, "0")}`, cumulative: round(cumulative) });
  }
  return out;
}

// --- helpers ---------------------------------------------------------------

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
const sum = (n: number[]) => n.reduce((a, b) => a + b, 0);
const mean = (n: number[]) => sum(n) / n.length;
const round = (n: number) => Math.round(n * 100) / 100;

function median(n: number[]): number {
  const s = [...n].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median absolute deviation — like stdev, but a single outlier can't drag it around. */
function mad(n: number[]): number {
  const m = median(n);
  return median(n.map((x) => Math.abs(x - m)));
}
