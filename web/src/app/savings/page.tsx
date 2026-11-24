"use client";

// Savings page: each fund's running total combines deposits planned in the
// Budget sheet (summed per month) with withdrawals recorded here. A deposit adds
// to the total; a withdrawal subtracts from it. Funds are defined by the user —
// add your own from the "Withdraw from" dropdown — and persist per account. Only
// withdrawals are editable here; deposits come from the budget.
import { useCallback, useEffect, useState } from "react";
import {
  createSaving,
  createSavingsFund,
  deleteBudgetEntry,
  deleteSaving,
  deleteSavingsFund,
  getBudgetBreakdown,
  getBudgetPlan,
  getSavings,
  getSavingsFunds,
  renameSavingsFund,
} from "@/lib/api";
import type { BudgetPlan, Saving } from "@/lib/types";
import BudgetDropdown from "../budget-dropdown";
import ConfirmDialog from "../confirm-dialog";
import DatePicker from "../date-picker";

// Friendly labels for funds that used to ship as built-ins, so a returning
// account's budget deposits keep a readable name.
const LEGACY_LABELS: Record<string, string> = {
  emergency: "Emergency Fund",
  travel: "Travel Fund",
  ph: "PH Fund",
};

// Turn a budget "savings:<id>" entry key into a display label.
function keyToLabel(entryKey: string): string {
  const id = entryKey.slice(entryKey.indexOf(":") + 1);
  if (LEGACY_LABELS[id]) return LEGACY_LABELS[id];
  const spaced = id.replace(/[-_]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

// The current "YYYY-MM-DD" date, used to seed the withdrawal form.
const currentDate = () => new Date().toISOString().slice(0, 10);

// Format a "YYYY-MM" key as e.g. "October 2026".
function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

type Row = {
  month: string;
  amount: number;
  kind: "deposit" | "withdrawal";
  savingId?: number;
};

export default function SavingsPage() {
  const [breakdown, setBreakdown] = useState<
    Record<string, Record<string, number>>
  >({});
  // Current month's budget plan, used to read each sinking-fund row's type and
  // label so Travel-typed rows can be matched to a Savings table by name.
  const [plan, setPlan] = useState<BudgetPlan>({});
  const [withdrawals, setWithdrawals] = useState<Saving[]>([]);
  const [funds, setFunds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => currentDate());
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s, f, p] = await Promise.all([
        getBudgetBreakdown(),
        getSavings(),
        getSavingsFunds(),
        getBudgetPlan(currentDate().slice(0, 7)),
      ]);
      setBreakdown(b);
      setWithdrawals(s);
      setFunds(f);
      setPlan(p);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load savings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Add a fund to the backend catalog (ignoring case-insensitive dupes).
  async function addFund(raw: string) {
    const label = raw.trim();
    if (!label) return;
    if (funds.some((f) => f.toLowerCase() === label.toLowerCase())) return;
    setFunds((prev) => [...prev, label]);
    try {
      await createSavingsFund(label);
    } catch (err) {
      setFunds((prev) => prev.filter((f) => f !== label));
      setError(err instanceof Error ? err.message : "failed to add fund");
    }
  }

  // Rename a user-added fund in the catalog. Since withdrawals have no update
  // endpoint, any recorded withdrawals are recreated under the new name.
  async function renameFund(oldLabel: string, newLabel: string) {
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === oldLabel) return;
    const clash = funds.some(
      (f) =>
        f.toLowerCase() === trimmed.toLowerCase() &&
        f.toLowerCase() !== oldLabel.toLowerCase(),
    );
    if (clash) {
      setError("A fund with that name already exists.");
      return;
    }
    setFunds((prev) => prev.map((f) => (f === oldLabel ? trimmed : f)));
    if (name.toLowerCase() === oldLabel.toLowerCase()) setName(trimmed);
    try {
      await renameSavingsFund(oldLabel, trimmed);
      const affected = withdrawals.filter(
        (s) => s.name.toLowerCase() === oldLabel.toLowerCase(),
      );
      for (const s of affected) {
        await createSaving({
          name: trimmed,
          amount: s.amount,
          month: s.month,
        });
        await deleteSaving(s.id);
      }
      if (affected.length > 0) await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to rename fund");
      await load();
    }
  }

  // Delete a fund everywhere: its catalog entry (if any), its planned budget
  // deposits across all months, and any recorded withdrawals. This lets the user
  // remove any dropdown choice, including ones that only came from the budget.
  async function deleteFund(label: string) {
    const lower = label.toLowerCase();
    const affected = withdrawals.filter((s) => s.name.toLowerCase() === lower);
    const keys = Object.keys(breakdown).filter((k) => {
      if (!k.startsWith("savings:")) return false;
      const t = plan[k]?.type?.trim();
      const fundLabel = t ? t : keyToLabel(k);
      return fundLabel.toLowerCase() === lower;
    });
    try {
      if (funds.some((f) => f.toLowerCase() === lower)) {
        await deleteSavingsFund(label);
      }
      for (const s of affected) await deleteSaving(s.id);
      for (const k of keys) await deleteBudgetEntry(k);
      if (name.toLowerCase() === lower) setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete fund");
      await load();
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const created = await createSaving({
        name,
        amount: Number(amount),
        month: date.slice(0, 7),
      });
      setWithdrawals((prev) => [created, ...prev]);
      addFund(name);
      setAmount("");
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "failed to record withdrawal",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteSaving(id);
      setWithdrawals((prev) => prev.filter((s) => s.id !== id));
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "failed to delete withdrawal",
      );
    }
  }

  // The funds to show: the user's saved list, plus any fund that already has
  // budget deposits or recorded withdrawals (so existing data never disappears).
  const depositKeys = Object.keys(breakdown).filter((k) =>
    k.startsWith("savings:"),
  );
  // The fund a budget "savings:" row belongs to. The fund name is chosen from
  // the row's Type dropdown (which mirrors the Savings tab's fund catalog), so a
  // row's deposits accrue to that fund. Rows that predate this (meaningful key,
  // no type) fall back to the label derived from the key.
  const fundOfKey = (k: string): string => {
    const t = plan[k]?.type?.trim();
    return t ? t : keyToLabel(k);
  };
  const fundLabels: string[] = [];
  const seen = new Set<string>();
  const pushLabel = (label: string) => {
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    fundLabels.push(label);
  };
  funds.forEach(pushLabel);
  depositKeys.forEach((k) => pushLabel(fundOfKey(k)));
  withdrawals.forEach((s) => pushLabel(s.name));

  // Build each fund's rows (budget deposits + recorded withdrawals) and net total.
  const userFundSet = new Set(funds.map((f) => f.toLowerCase()));
  const fundData = fundLabels.map((label) => {
    const lower = label.toLowerCase();
    const deposits: Row[] = depositKeys
      .filter((k) => fundOfKey(k).toLowerCase() === lower)
      .flatMap((k) => Object.entries(breakdown[k] ?? {}))
      .filter(([, amt]) => amt !== 0)
      .map(([m, amt]) => ({ month: m, amount: amt, kind: "deposit" as const }));
    const fundWithdrawals: Row[] = withdrawals
      .filter((s) => s.name.toLowerCase() === lower)
      .map((s) => ({
        month: s.month,
        amount: s.amount,
        kind: "withdrawal" as const,
        savingId: s.id,
      }));
    const rows = [...deposits, ...fundWithdrawals].sort((a, b) =>
      b.month.localeCompare(a.month),
    );
    const total =
      deposits.reduce((sum, r) => sum + r.amount, 0) -
      fundWithdrawals.reduce((sum, r) => sum + r.amount, 0);
    return { label, rows, total };
  });

  const overallTotal = fundData.reduce((sum, f) => sum + f.total, 0);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Savings</h1>
        <p className="text-sm text-amber-900/70">
          Budget deposits minus withdrawals, per fund.
        </p>
      </header>

      <div className="rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm">
        <span className="text-sm text-amber-900/70">
          Total saved (all funds)
        </span>
        <div className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-emerald-700">
          {currency.format(overallTotal)}
        </div>
      </div>

      <form
        onSubmit={handleWithdraw}
        className="flex flex-col gap-3 rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm sm:flex-row sm:items-end"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-700">
            Withdraw from
          </span>
          <BudgetDropdown
            value={name}
            options={fundLabels}
            onChange={setName}
            onAddNew={addFund}
            onRename={renameFund}
            onDelete={(label) => setPendingDelete(label)}
            isEditable={(label) => userFundSet.has(label.toLowerCase())}
            isDeletable={() => true}
            placeholder="Select fund…"
            addLabel="Add fund…"
            ariaLabel="Fund to withdraw from"
          />
        </label>
        <label className="flex w-full flex-col gap-1.5 sm:w-44">
          <span className="text-sm font-medium text-zinc-700">Date</span>
          <DatePicker
            value={date}
            onChange={setDate}
            placeholder="Pick a date"
          />
        </label>
        <label className="flex w-full flex-col gap-1.5 sm:w-32">
          <span className="text-sm font-medium text-zinc-700">Amount (€)</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
            className="rounded-lg border border-amber-900/20 px-3 py-2 text-sm text-zinc-900 tabular-nums focus:border-amber-700 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="rounded-lg bg-linear-to-r from-amber-900 to-amber-700 px-4 py-2 text-sm font-semibold text-amber-50 shadow-sm transition-all hover:from-amber-800 hover:to-amber-600 disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Record withdrawal"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="px-6 py-8 text-center text-sm text-amber-900/60">
          Loading…
        </p>
      ) : fundLabels.length === 0 ? (
        <p className="rounded-xl border border-dashed border-amber-900/25 bg-white px-6 py-10 text-center text-sm text-amber-900/60">
          No funds yet. Use the “Withdraw from” dropdown above to add your first
          fund.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {fundData.map((fund) => (
            <section
              key={fund.label}
              className="overflow-hidden rounded-xl border border-amber-900/20 bg-white shadow-sm"
            >
              <div className="flex items-center justify-between gap-4 border-b border-amber-900/10 px-6 py-4">
                <h2 className="text-base font-semibold text-zinc-900">
                  {fund.label}
                </h2>
                <span className="tabular-nums text-sm font-semibold text-emerald-700">
                  {currency.format(fund.total)}
                </span>
              </div>
              {fund.rows.length === 0 ? (
                <p className="px-6 py-6 text-center text-sm text-amber-900/60">
                  No activity yet.
                </p>
              ) : (
                <ul className="divide-y divide-amber-900/10">
                  {fund.rows.map((row) => (
                    <li
                      key={`${row.kind}-${row.savingId ?? row.month}`}
                      className="flex items-center justify-between gap-3 px-6 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                            row.kind === "deposit"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {row.kind === "deposit" ? "Deposit" : "Withdraw"}
                        </span>
                        <span className="truncate text-sm text-amber-900/70">
                          {monthLabel(row.month)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`tabular-nums text-sm font-semibold ${
                            row.kind === "deposit"
                              ? "text-zinc-900"
                              : "text-red-600"
                          }`}
                        >
                          {row.kind === "deposit" ? "+" : "−"}
                          {currency.format(row.amount)}
                        </span>
                        {row.kind === "withdrawal" &&
                          row.savingId !== undefined && (
                            <button
                              type="button"
                              onClick={() => handleDelete(row.savingId!)}
                              aria-label={`Delete ${fund.label} withdrawal in ${row.month}`}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M3 6h18" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete fund"
        message={`Delete “${pendingDelete}”, its planned budget deposits, and any withdrawals recorded for it? This cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const label = pendingDelete;
          setPendingDelete(null);
          if (label) deleteFund(label);
        }}
      />
    </main>
  );
}
