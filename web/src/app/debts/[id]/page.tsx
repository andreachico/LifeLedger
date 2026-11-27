"use client";

// Debt detail: the full month-by-month payment schedule for one installment plan.
// Laid out as an "installment plan" sheet — a remaining-balance hero with a
// progress bar and next-installment card, a stats grid, and a filterable payment
// schedule whose rows can be toggled between Paid and To pay (persisted via the
// /debts API).
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getDebt, updateDebtPaid } from "@/lib/api";
import type { Debt } from "@/lib/types";
import {
  addMonths,
  buildSchedule,
  monthLabel,
  remainingBalance,
} from "../schedule";

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

type Filter = "all" | "topay" | "paid";

export default function DebtDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const [debt, setDebt] = useState<Debt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDebt(await getDebt(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load plan");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const schedule = useMemo(() => (debt ? buildSchedule(debt) : []), [debt]);

  // Toggle an installment's status. Payments are sequential, so marking
  // installment n as paid marks 1..n paid; marking it unpaid marks n..end unpaid.
  async function toggle(installment: number, currentlyPaid: boolean) {
    if (!debt) return;
    const paidMonths = currentlyPaid ? installment - 1 : installment;
    setSaving(true);
    setDebt({ ...debt, paidMonths }); // optimistic
    try {
      const updated = await updateDebtPaid(debt.id, paidMonths);
      setDebt(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to update");
      load(); // revert to server state
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    if (!debt) return;
    const header = "Installment,Month,Amount,Projected balance,Status";
    const lines = schedule.map(
      (r) =>
        `${r.installment},${r.monthName} ${r.year},${r.monthlyRate.toFixed(
          2,
        )},${r.leftToPay.toFixed(2)},${r.paid ? "Paid" : "To pay"}`,
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${debt.name.replace(/\s+/g, "-").toLowerCase()}-schedule.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <p className="text-center text-sm text-amber-900/60">Loading…</p>
      </main>
    );
  }

  if (!debt) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <Link href="/debts" className="text-sm text-amber-800 hover:underline">
          ← Back to debts
        </Link>
        <p className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "Plan not found."}
        </p>
      </main>
    );
  }

  const left = remainingBalance(debt);
  const paidTotal = debt.totalAmount - left;
  const pct =
    debt.termMonths > 0
      ? Math.round((debt.paidMonths / debt.termMonths) * 100)
      : 0;
  const lastMonth = addMonths(debt.startMonth, debt.termMonths - 1);
  const remainingPayments = debt.termMonths - debt.paidMonths;

  // The next installment is the first unpaid one (if any remain).
  const nextRow = schedule.find((r) => !r.paid) ?? null;

  const paidCount = schedule.filter((r) => r.paid).length;
  const toPayCount = schedule.length - paidCount;
  const visible = schedule.filter((r) =>
    filter === "all" ? true : filter === "paid" ? r.paid : !r.paid,
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      {/* ---------- Header ---------- */}
      <div className="flex flex-col gap-4">
        <Link
          href="/debts"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-amber-900/70 transition-colors hover:text-amber-900"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to debts
        </Link>

        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
            Installment plan
          </div>
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-zinc-900">
            {debt.name}
          </h1>
          <p className="mt-2 text-sm text-amber-900/60">
            {debt.termMonths} monthly installments
            <span className="mx-2 text-amber-900/30">·</span>
            {monthLabel(debt.startMonth)} – {monthLabel(lastMonth)}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ---------- Remaining balance hero ---------- */}
      <section className="rounded-2xl border border-amber-900/15 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-900/50">
              Remaining balance
            </span>
            <div className="mt-1 font-serif text-5xl font-semibold tracking-tight tabular-nums text-zinc-900">
              {currency.format(left)}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-sm text-emerald-700">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              {currency.format(paidTotal)} paid of{" "}
              {currency.format(debt.totalAmount)}
            </div>

            {/* Segmented progress bar. */}
            <div className="mt-5 flex gap-1.5">
              {schedule.map((r) => (
                <div
                  key={r.installment}
                  className={`h-2.5 flex-1 rounded-full ${
                    r.paid ? "bg-emerald-600" : "bg-amber-900/10"
                  }`}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-amber-900/60">
              {debt.paidMonths} of {debt.termMonths} installments paid
              <span className="mx-1.5 text-amber-900/30">·</span>
              {pct}% complete
            </p>
          </div>

          {/* Next installment card. */}
          <div className="border-amber-800 lg:border-l-4 lg:pl-7">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Next installment
            </div>
            {nextRow ? (
              <>
                <div className="mt-1 font-serif text-3xl font-semibold tabular-nums text-zinc-900">
                  {currency.format(nextRow.monthlyRate)}
                </div>
                <div className="text-sm text-amber-900/70">
                  {nextRow.monthName} {nextRow.year}
                </div>
                <div className="mt-1 text-xs text-amber-900/50">
                  {remainingPayments} payment
                  {remainingPayments === 1 ? "" : "s"} remaining
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm font-medium text-emerald-700">
                All installments paid
              </div>
            )}
          </div>
        </div>

        {/* Stats grid. */}
        <div className="mt-7 grid grid-cols-2 gap-6 border-t border-amber-900/10 pt-6 sm:grid-cols-4">
          <Stat label="Original amount" value={currency.format(debt.totalAmount)} />
          <Stat label="Monthly installment" value={currency.format(debt.monthlyRate)} />
          <Stat
            label="Paid to date"
            value={currency.format(paidTotal)}
            tone="emerald"
          />
          <Stat label="Final installment" value={monthLabel(lastMonth)} />
        </div>
      </section>

      {/* ---------- Payment schedule ---------- */}
      <section className="rounded-2xl border border-amber-900/15 bg-white p-7 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl font-semibold tracking-tight text-zinc-900">
              Payment schedule
            </h2>
            <p className="mt-1 text-sm text-amber-900/60">
              {monthLabel(debt.startMonth)} – {monthLabel(lastMonth)}
            </p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            aria-label="Download schedule as CSV"
            className="rounded-lg border border-amber-900/20 p-2 text-amber-900/70 transition-colors hover:bg-amber-900/5 hover:text-amber-900"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>

        {/* Filter tabs. */}
        <div className="mt-4 inline-flex gap-1 rounded-lg bg-amber-900/5 p-1">
          <FilterTab
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label="All"
            count={schedule.length}
          />
          <FilterTab
            active={filter === "topay"}
            onClick={() => setFilter("topay")}
            label="To pay"
            count={toPayCount}
          />
          <FilterTab
            active={filter === "paid"}
            onClick={() => setFilter("paid")}
            label="Paid"
            count={paidCount}
          />
        </div>

        {/* Table. */}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-amber-900/10 text-left text-xs font-medium uppercase tracking-wide text-amber-900/50">
                <th className="py-3 pl-4 pr-4 font-medium">Installment</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-right font-medium">
                  Projected balance
                </th>
                <th className="py-3 pl-4 pr-4 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => {
                const isNext = nextRow?.installment === r.installment;
                const showYear = i === 0 || visible[i - 1].year !== r.year;
                return (
                  <Fragment key={r.installment}>
                    {showYear && (
                      <tr>
                        <td
                          colSpan={4}
                          className="bg-amber-900/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-900/50"
                        >
                          {r.year}
                        </td>
                      </tr>
                    )}
                    <tr className="border-b border-amber-900/5">
                    <td
                      className={`py-4 pl-4 pr-4 ${
                        isNext ? "bg-orange-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            r.paid
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-900/5 text-amber-900/50"
                          }`}
                        >
                          {r.paid ? (
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            r.installment
                          )}
                        </span>
                        <div>
                          <div className="font-medium text-zinc-900">
                            {r.monthName}
                          </div>
                          {isNext && (
                            <div className="text-xs font-medium text-orange-700">
                              Next installment
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td
                      className={`px-4 py-4 text-right tabular-nums text-zinc-900 ${
                        isNext ? "bg-orange-50" : ""
                      }`}
                    >
                      {currency.format(r.monthlyRate)}
                    </td>
                    <td
                      className={`px-4 py-4 text-right tabular-nums text-amber-900/70 ${
                        isNext ? "bg-orange-50" : ""
                      }`}
                    >
                      {currency.format(r.leftToPay)}
                    </td>
                    <td
                      className={`py-4 pl-4 pr-4 text-right ${
                        isNext ? "bg-orange-50" : ""
                      }`}
                    >
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => toggle(r.installment, r.paid)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                          r.paid
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            : "bg-orange-100 text-orange-700 hover:bg-orange-200"
                        }`}
                      >
                        {r.paid ? (
                          <>
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Paid
                          </>
                        ) : (
                          <>
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                            To pay
                          </>
                        )}
                      </button>
                    </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-5 border-t border-amber-900/10 pt-4 text-xs text-amber-900/50">
          Balances show the amount remaining after each scheduled installment.
          Only installments marked paid count toward your paid-to-date total.
        </p>
      </section>

      {/* ---------- Final installment callout ---------- */}
      <section className="flex items-center gap-4 rounded-2xl border border-emerald-600/20 bg-emerald-50/60 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
        </span>
        <div>
          <div className="font-medium text-zinc-900">
            Final installment · {monthLabel(lastMonth)}
          </div>
          <div className="text-sm text-amber-900/60">
            {currency.format(debt.totalAmount)} repaid once all {debt.termMonths}{" "}
            payments are complete
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: string;
  tone?: "zinc" | "emerald";
}) {
  return (
    <div>
      <div className="text-xs text-amber-900/50">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === "emerald" ? "text-emerald-700" : "text-zinc-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-white text-zinc-900 shadow-sm"
          : "text-amber-900/60 hover:text-amber-900"
      }`}
    >
      {label}
      <span
        className={`text-xs ${active ? "text-amber-900/50" : "text-amber-900/40"}`}
      >
        {count}
      </span>
    </button>
  );
}
