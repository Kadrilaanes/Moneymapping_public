"use client";

import { useState } from "react";
import { projectFlatSavings, type Account, type GoalStatus } from "@/lib/analysis";
import { Card, EmptyState } from "./SpendingByCategory";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export function GoalProgress({
  goal,
  accounts,
}: {
  goal: (GoalStatus & { year: number }) | null;
  accounts: Account[];
}) {
  const [monthlyAmount, setMonthlyAmount] = useState(200);

  if (!goal) {
    return (
      <Card title="Savings goal">
        <EmptyState text={`No target set for ${new Date().getFullYear()}. Add one: insert into goal (year, target_amount) values (${new Date().getFullYear()}, 10000);`} />
      </Card>
    );
  }

  const savingsAccounts = accounts.filter((a) => a.type === "savings");
  const pct = Math.min(100, Math.max(0, (goal.saved / goal.target) * 100));
  const scenario = projectFlatSavings(goal.saved, monthlyAmount, goal.monthsLeft, goal.year);
  const yearEnd = scenario.at(-1)?.cumulative ?? goal.saved;
  const meetsGoal = yearEnd >= goal.target;
  const maxBar = Math.max(goal.target, yearEnd);

  return (
    <Card title={`Savings goal ${goal.year}`} subtitle={goal.onTrack ? "On track" : "Behind"}>
      <div className="mb-4">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-2xl font-semibold tabular-nums text-ink">{fmt(goal.saved)}</span>
          <span className="text-sm text-muted">of {fmt(goal.target)}</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-line">
          <div
            className="h-2.5 rounded-full"
            style={{ width: `${pct}%`, background: goal.onTrack ? "var(--color-good)" : "var(--color-bad)" }}
          />
        </div>
        <p className="mt-1 text-xs text-muted">
          {fmt(goal.liquidSaved)} liquid · {fmt(goal.saved - goal.liquidSaved)} locked
        </p>
        {savingsAccounts.length > 1 && (
          <ul className="mt-2 space-y-0.5">
            {savingsAccounts.map((a) => (
              <li key={a.id} className="flex justify-between text-xs text-muted">
                <span>{a.name}</span>
                <span className="tabular-nums">{fmt(a.balance)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Stat label="Required / month" value={fmt(goal.requiredPerMonth)} />
        <Stat label="Actual / month (since Jan)" value={fmt(goal.actualPerMonth)} />
        <Stat label="Projected year-end" value={fmt(goal.projected)} />
        <Stat
          label={goal.gap >= 0 ? "Surplus" : "Shortfall"}
          value={fmt(Math.abs(goal.gap))}
          tone={goal.gap >= 0 ? "good" : "bad"}
        />
      </dl>
      {goal.projectedInterest > 0 && (
        <p className="mt-2 text-xs text-muted">
          Includes {fmt(goal.projectedInterest)} in projected interest — investments (e.g. Revolut)
          aren't counted here.
        </p>
      )}

      {!goal.onTrack && goal.shortfallPerMonth > 0 && (
        <p className="mt-4 rounded-md bg-paper px-3 py-2 text-xs text-muted">
          Trim {fmt(goal.shortfallPerMonth)}/month to close the gap by year-end.
        </p>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <div className="mb-3 flex items-center justify-between">
          <label htmlFor="what-if-amount" className="text-xs text-muted">
            What if you set aside
          </label>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted">€</span>
            <input
              id="what-if-amount"
              type="number"
              min={0}
              step={10}
              value={monthlyAmount}
              onChange={(e) => setMonthlyAmount(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 rounded border border-line px-1.5 py-0.5 text-right text-xs outline-none focus:border-accent"
            />
            <span className="text-xs text-muted">/month?</span>
          </div>
        </div>

        <div className="flex items-end gap-1.5">
          {scenario.map((s) => (
            <div key={s.month} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-16 w-full items-end">
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${Math.min(100, (s.cumulative / maxBar) * 100)}%`,
                    background: meetsGoal ? "var(--color-good)" : "var(--color-accent)",
                  }}
                  title={fmt(s.cumulative)}
                />
              </div>
              <span className="text-[10px] text-muted">{s.month.slice(5)}</span>
            </div>
          ))}
        </div>

        <p className={`mt-2 text-xs ${meetsGoal ? "text-good" : "text-bad"}`}>
          By December: {fmt(yearEnd)} —{" "}
          {meetsGoal
            ? `${fmt(yearEnd - goal.target)} above target`
            : `${fmt(goal.target - yearEnd)} short of target`}
        </p>
      </div>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`tabular-nums font-medium ${color}`}>{value}</dd>
    </div>
  );
}
