import { db } from "./db";
import {
  Account,
  Cashflow,
  GoalStatus,
  IncomeProjection,
  Recurring,
  Txn,
  expectedMonthlyIncome,
  findRecurring,
  goalStatus,
  monthlyCashflow,
  projectIncome,
} from "./analysis";

export type CategoryKind = "income" | "expense" | "transfer";
export type CategoryInfo = { name: string; kind: CategoryKind };

/**
 * Everything here reads from Postgres, never from Enable Banking directly —
 * see CLAUDE.md. `category` and `is_internal_transfer` are already resolved
 * at sync time, so these queries just shape rows into the types analysis.ts
 * expects and hand off to the pure functions.
 */

export async function getAccounts(): Promise<Account[]> {
  const { rows } = await db.query(
    `select id, name, iban, type, liquid,
            coalesce(balance, 0)::float as balance, currency,
            interest_rate::float as "interestRate",
            accrued_interest::float as "accruedInterest",
            balance_synced_at::text as "balanceSyncedAt"
       from account
      order by type, name`,
  );
  return rows;
}

export async function getConsentStatus(): Promise<
  { account: string; bank: string; validUntil: string; daysLeft: number }[]
> {
  const { rows } = await db.query(
    `select a.name as account, s.aspsp_name as bank, s.valid_until,
            extract(day from s.valid_until - now())::int as "daysLeft"
       from account a
       join bank_session s on s.id = a.session_id
      order by s.valid_until asc`,
  );
  return rows;
}

async function getTransactions(monthsBack: number): Promise<Txn[]> {
  const { rows } = await db.query(
    `select id, account_id as "accountId", booking_date::text as date,
            amount::float, currency, counterparty,
            counterparty_iban as "counterpartyIban", description, mcc,
            category, is_internal_transfer as "isInternalTransfer"
       from transaction
      where booking_date > current_date - ($1 || ' months')::interval
      order by booking_date asc`,
    [monthsBack],
  );
  return rows;
}

export async function getAvailableMonths(): Promise<string[]> {
  const { rows } = await db.query(
    `select distinct to_char(booking_date, 'YYYY-MM') as month
       from transaction order by month desc`,
  );
  return rows.map((r) => r.month as string);
}

export async function getTransactionsForMonth(month: string): Promise<Txn[]> {
  const { rows } = await db.query(
    `select id, account_id as "accountId", booking_date::text as date,
            amount::float, currency, counterparty,
            counterparty_iban as "counterpartyIban", description, mcc,
            category, is_internal_transfer as "isInternalTransfer"
       from transaction
      where to_char(booking_date, 'YYYY-MM') = $1
      order by booking_date desc, id`,
    [month],
  );
  return rows;
}

export async function getCategories(): Promise<CategoryInfo[]> {
  const { rows } = await db.query(`select name, kind from category order by kind, name`);
  return rows;
}

export type HoldingInfo = {
  id: number;
  accountId: string;
  accountName: string;
  ticker: string;
  shares: number;
  costBasis: number | null;
};

export async function getHoldings(): Promise<HoldingInfo[]> {
  const { rows } = await db.query(
    `select h.id, h.account_id as "accountId", a.name as "accountName", h.ticker,
            h.shares::float, h.cost_basis::float as "costBasis"
       from holding h join account a on a.id = h.account_id
      order by a.name, h.ticker`,
  );
  return rows;
}

export type DashboardData = {
  accounts: Account[];
  categories: CategoryInfo[];
  cashflow: Cashflow[]; // full window — powers the trend chart and prev/next nav
  selectedMonth?: Cashflow; // the month the "spending by category" card shows
  recurring: Recurring[];
  incomeProjection: IncomeProjection[];
  /** Recurring income expected for the currently-selected month — used to
   *  flag a still-in-progress month whose salary hasn't landed yet. */
  expectedIncome: number;
  isCurrentMonth: boolean;
  goal: (GoalStatus & { year: number }) | null;
  hasAnyData: boolean;
};

/** `month`, if given, picks which month "spending by category" shows; defaults to the latest. */
export async function getDashboardData(month?: string): Promise<DashboardData> {
  const [accounts, categories, txns, goalRow] = await Promise.all([
    getAccounts(),
    getCategories(),
    getTransactions(13),
    db.query(
      `select year, target_amount::float as "targetAmount", currency
         from goal where year = extract(year from current_date) limit 1`,
    ),
  ]);

  const cashflow = monthlyCashflow(txns);
  const targetMonth = month && cashflow.some((c) => c.month === month) ? month : cashflow.at(-1)?.month;
  const selectedMonth = cashflow.find((c) => c.month === targetMonth);
  const recurring = findRecurring(txns);

  const today = new Date();
  const incomeProjection = projectIncome(txns, 3, today);
  const expectedIncome = expectedMonthlyIncome(txns, today);
  const isCurrentMonth = selectedMonth?.month === today.toISOString().slice(0, 7);

  const goalConfig = goalRow.rows[0] as
    | { year: number; targetAmount: number; currency: string }
    | undefined;

  const goal = goalConfig
    ? { ...goalStatus(goalConfig.targetAmount, accounts, cashflow), year: goalConfig.year }
    : null;

  return {
    accounts,
    categories,
    cashflow,
    selectedMonth,
    recurring,
    incomeProjection,
    expectedIncome,
    isCurrentMonth,
    goal,
    hasAnyData: txns.length > 0,
  };
}
