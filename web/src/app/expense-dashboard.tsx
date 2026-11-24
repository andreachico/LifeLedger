"use client";

import { useEffect, useMemo, useState } from "react";
import type { BudgetPlan, Expense } from "@/lib/types";
import {
  createExpense,
  deleteExpense,
  getBudgetPlan,
  getBudgetTypeOptions,
} from "@/lib/api";
import SpendingCharts from "./spending-charts";
import BudgetDropdown from "./budget-dropdown";
import { CATEGORY_ICONS, CategoryGlyph, iconColor } from "./category-icons";

const today = () => new Date().toISOString().slice(0, 10);

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Build a YYYY-MM key used to match an expense's date to a month/year.
const monthKey = (year: number, month: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}`;

// Plan-key prefix the budget sheet uses for its "Variable Kosten" rows, e.g.
// "variable:<id>". Those rows are the single source of truth for this page's
// categories (their Category column) and planned "Soll" amounts.
const VARIABLE_PREFIX = "variable:";

// Type-options section id the budget sheet uses to store each category's chosen
// icon (name -> icon id). Read here so the category table shows those icons.
const VARIABLE_CATEGORY_SECTION = "variable-category";

// Each category gets its own pastel badge color. Full class strings are used so
// Tailwind's compiler can detect them.
const CATEGORY_COLORS: Record<string, string> = {
  Groceries: "bg-emerald-100 text-emerald-800",
  Drogerie: "bg-sky-100 text-sky-800",
  "Restaurant/Food Order": "bg-rose-100 text-rose-800",
  Freizeit: "bg-violet-100 text-violet-800",
  "Online Bestellung": "bg-amber-100 text-amber-800",
};

const categoryColor = (category: string) =>
  CATEGORY_COLORS[category] ?? "bg-zinc-100 text-zinc-700";

// The form holds strings because <input> values are strings; we convert amount
// to a number when submitting.
const emptyForm = {
  amount: "",
  category: "",
  description: "",
  date: today(),
};

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const formatDate = (iso: string) => dateFmt.format(new Date(`${iso}T00:00:00`));

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

// A distinct glyph per category, wrapped in a soft brown tile. When the user has
// picked a preset icon for the category, that icon is shown; otherwise it falls
// back to the built-in glyph for the default categories.
function CategoryIcon({
  category,
  iconId,
}: {
  category: string;
  iconId?: string;
}) {
  if (iconId && CATEGORY_ICONS.some((i) => i.id === iconId)) {
    return (
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconColor(iconId)}`}
      >
        <CategoryGlyph id={iconId} size={18} />
      </span>
    );
  }
  let glyph;
  switch (category) {
    case "Groceries":
      glyph = (
        <svg {...iconProps} aria-hidden="true">
          <path d="m5 11 4-7" />
          <path d="m19 11-4-7" />
          <path d="M2 11h20" />
          <path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L20.5 11" />
          <path d="M4.5 15.5h15" />
        </svg>
      );
      break;
    case "Drogerie":
      glyph = (
        <svg {...iconProps} aria-hidden="true">
          <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
          <path d="m8.5 8.5 7 7" />
        </svg>
      );
      break;
    case "Restaurant/Food Order":
      glyph = (
        <svg {...iconProps} aria-hidden="true">
          <path d="M3 2v7c0 1.1.9 2 2 2a2 2 0 0 0 2-2V2" />
          <path d="M7 2v20" />
          <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
        </svg>
      );
      break;
    case "Freizeit":
      glyph = (
        <svg {...iconProps} aria-hidden="true">
          <path d="M12 3l2.1 6.3H20l-4.9 3.6 1.9 6.1L12 15.8 7 19l1.9-6.1L4 9.3h5.9z" />
        </svg>
      );
      break;
    case "Online Bestellung":
      glyph = (
        <svg {...iconProps} aria-hidden="true">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
      break;
    default:
      glyph = (
        <svg {...iconProps} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${categoryColor(category)}`}
    >
      {glyph}
    </span>
  );
}

function TrashIcon() {
  return (
    <svg {...iconProps} aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

// ExpenseDashboard receives the server-rendered initial list and then owns it
// client-side, updating local state as the user adds and deletes expenses — no
// extra fetch on mount is needed.
export default function ExpenseDashboard({
  initialExpenses,
  initialError,
}: {
  initialExpenses: Expense[];
  initialError?: string;
}) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  // Whether the "Add expense" modal is open.
  const [showAddModal, setShowAddModal] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const periodKey = monthKey(selectedYear, selectedMonth);

  // The selected month's budget plan from the budget sheet. Its "Variable Kosten"
  // rows are the single source of truth for this page: the categories shown here
  // come from each row's Category column, and the Soll column is the sum of those
  // rows' planned amounts. Reloaded whenever the selected month changes.
  const [budgetPlan, setBudgetPlan] = useState<BudgetPlan>({});
  useEffect(() => {
    let active = true;
    getBudgetPlan(periodKey)
      .then((plan) => {
        if (active) setBudgetPlan(plan ?? {});
      })
      .catch(() => {
        // Ignore load failures; the page still works with no planned amounts.
        if (active) setBudgetPlan({});
      });
    return () => {
      active = false;
    };
  }, [periodKey]);

  // Per-category icons chosen on the budget sheet (category name -> icon id).
  // Loaded once from the shared type-options store; the budget sheet owns these.
  const [categoryIcons, setCategoryIcons] = useState<Record<string, string>>(
    {},
  );
  useEffect(() => {
    let active = true;
    getBudgetTypeOptions()
      .then((opts) => {
        if (!active) return;
        const map: Record<string, string> = {};
        for (const o of opts[VARIABLE_CATEGORY_SECTION] ?? []) {
          if (o.icon) map[o.name] = o.icon;
        }
        setCategoryIcons(map);
      })
      .catch(() => {
        // Ignore load failures; categories fall back to name-based glyphs.
      });
    return () => {
      active = false;
    };
  }, []);

  // The month's Variable Kosten rows (plan keys look like "variable:<id>").
  const variableEntries = useMemo(
    () =>
      Object.entries(budgetPlan)
        .filter(([key]) => key.startsWith(VARIABLE_PREFIX))
        .map(([, entry]) => entry),
    [budgetPlan],
  );

  // Categories come straight from the Variable Kosten "Category" column, in the
  // order the rows appear, with blanks and duplicates removed.
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const entry of variableEntries) {
      const name = entry.category.trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        list.push(name);
      }
    }
    return list;
  }, [variableEntries]);

  // Soll ("planned") per category: the sum of every Variable Kosten row that
  // shares that category in the selected month.
  const sollByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of variableEntries) {
      const name = entry.category.trim();
      if (!name) continue;
      map[name] = (map[name] ?? 0) + (Number(entry.amount) || 0);
    }
    return map;
  }, [variableEntries]);

  // Changing the month/year both filters the list and sets the date new
  // expenses are saved under.
  function selectPeriod(month: number, year: number) {
    setSelectedMonth(month);
    setSelectedYear(year);
    setForm((prev) => ({ ...prev, date: `${monthKey(year, month)}-01` }));
  }

  // Step the selected period forward/backward by whole months, rolling the year
  // over at the boundaries.
  function shiftPeriod(delta: number) {
    const d = new Date(selectedYear, selectedMonth + delta, 1);
    selectPeriod(d.getMonth(), d.getFullYear());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.category.trim()) {
      setError("please select a category");
      return;
    }
    setSubmitting(true);
    try {
      const created = await createExpense({
        amount: Number(form.amount),
        category: form.category,
        description: form.description,
        date: form.date,
      });
      setExpenses((prev) => [...prev, created]);
      setForm({ ...emptyForm, date: form.date }); // keep the date for quick entry
      setShowAddModal(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to add expense");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteExpense(id);
      setExpenses((prev) => prev.filter((x) => x.id !== id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete expense");
    }
  }

  // Only show (and total) the expenses that fall in the selected month/year.
  const visibleExpenses = expenses.filter((e) =>
    e.date.startsWith(monthKey(selectedYear, selectedMonth)),
  );
  const total = visibleExpenses.reduce((sum, e) => sum + e.amount, 0);

  // "ist" = what was actually spent in the selected month for a category.
  const istForCategory = (category: string) =>
    visibleExpenses
      .filter((e) => e.category === category)
      .reduce((sum, e) => sum + e.amount, 0);

  // Summary figures derived from the budget sheet's per-category "soll" totals
  // and the month's actual spending.
  const monthlyBudget = categories.reduce(
    (sum, c) => sum + (sollByCategory[c] ?? 0),
    0,
  );
  const leftToSpend = monthlyBudget - total;
  const percentUsed =
    monthlyBudget > 0 ? Math.round((total / monthlyBudget) * 100) : 0;

  // Rows actually rendered: the month's expenses narrowed by the search box.
  const query = search.trim().toLowerCase();
  const shownExpenses = query
    ? visibleExpenses.filter(
        (e) =>
          e.description.toLowerCase().includes(query) ||
          e.category.toLowerCase().includes(query),
      )
    : visibleExpenses;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10 lg:flex-row">
      <div className="min-w-0 flex-1">
      <header className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Variable Expenses
            </h1>
            <p className="text-sm text-amber-900/70">
              Track your day-to-day spending and see where your money goes each month.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Month picker, matching the budget sheet's prev/next control. */}
          <div className="flex items-center gap-1 rounded-xl border border-amber-900/20 bg-white px-2 py-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => shiftPeriod(-1)}
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/70 transition-colors hover:bg-amber-900/5"
            >
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="min-w-32 text-center text-sm font-semibold text-zinc-900">
              {MONTHS[selectedMonth]} {selectedYear}
            </span>
            <button
              type="button"
              onClick={() => shiftPeriod(1)}
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/70 transition-colors hover:bg-amber-900/5"
            >
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <section className="mb-8">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-900/20 bg-white p-5 shadow-sm">
            <div className="text-sm text-amber-900/70">Total spent</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">
              {currency.format(total)}
            </div>
            <div className="mt-3 text-sm text-amber-800">
              This month · {visibleExpenses.length} expenses
            </div>
          </div>

          <div className="rounded-xl border border-amber-900/20 bg-white p-5 shadow-sm">
            <div className="text-sm text-amber-900/70">Monthly budget</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">
              {currency.format(monthlyBudget)}
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-amber-100">
              <div
                className={`h-full rounded-full ${
                  percentUsed > 100 ? "bg-red-600" : "bg-amber-800"
                }`}
                style={{ width: `${Math.min(percentUsed, 100)}%` }}
              />
            </div>
            <div className="mt-2 text-sm text-amber-800">
              {percentUsed}% of your monthly budget used
            </div>
          </div>

          <div className="rounded-xl border border-amber-900/20 bg-white p-5 shadow-sm">
            <div className="text-sm text-amber-900/70">Left to spend</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">
              {currency.format(leftToSpend)}
            </div>
            <div className="mt-3 text-sm text-amber-800">
              {leftToSpend >= 0
                ? "You're within your budget"
                : "You're over your budget"}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-amber-900/20 bg-white shadow-sm">
          <table className="w-full text-sm text-zinc-900">
            <thead>
              <tr className="bg-[#f1e8d9] text-xs font-bold uppercase tracking-wide text-amber-900">
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-center">Soll</th>
                <th className="px-3 py-2 text-center">Ist</th>
                <th className="px-3 py-2 text-center">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-900/10">
              {categories.map((cat) => {
                const ist = istForCategory(cat);
                const soll = sollByCategory[cat] ?? 0;
                const over = soll > 0 && ist > soll;
                const remaining = soll - ist;
                return (
                  <tr key={cat}>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <CategoryIcon category={cat} iconId={categoryIcons[cat]} />
                        {cat}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center font-semibold tabular-nums text-zinc-900">
                      {currency.format(soll)}
                    </td>
                    <td
                      className={`px-3 py-2 text-center font-semibold tabular-nums ${
                        over ? "text-red-700" : "text-amber-900"
                      }`}
                    >
                      {currency.format(ist)}
                    </td>
                    <td
                      className={`px-3 py-2 text-center font-semibold tabular-nums ${
                        remaining < 0 ? "text-red-700" : "text-amber-900"
                      }`}
                    >
                      {currency.format(remaining)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-amber-900/20 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-900/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-900">
              Recent expenses
            </h2>
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {visibleExpenses.length}
            </span>
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-amber-900/40">
              <svg {...iconProps} aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search expenses…"
              className="w-64 rounded-lg border border-amber-900/20 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 border-b border-amber-900/10 bg-[#f1e8d9] px-5 py-2 text-xs font-bold uppercase tracking-wide text-amber-900">
          <span className="flex-1 min-w-0">Description</span>
          <span className="w-36 shrink-0">Category</span>
          <span className="w-28 shrink-0">Date</span>
          <span className="w-28 shrink-0 text-center">Amount</span>
          <span className="w-10 shrink-0" />
        </div>

        <ul className="divide-y divide-amber-900/10">
          {shownExpenses.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-4 bg-white px-5 py-3 text-sm text-zinc-900 hover:bg-amber-900/5"
            >
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <CategoryIcon category={e.category} iconId={categoryIcons[e.category]} />
                <span className="truncate font-medium">
                  {e.description || "—"}
                </span>
              </span>
              <span className="w-36 shrink-0">
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${categoryColor(
                    e.category,
                  )}`}
                >
                  {e.category}
                </span>
              </span>
              <span className="w-28 shrink-0 text-amber-900/70 tabular-nums">
                {formatDate(e.date)}
              </span>
              <span className="w-28 shrink-0 text-center font-semibold tabular-nums">
                {currency.format(e.amount)}
              </span>
              <span className="w-10 shrink-0 text-right">
                <button
                  onClick={() => handleDelete(e.id)}
                  aria-label={`Delete ${e.category}`}
                  className="text-amber-900/40 hover:text-red-600"
                >
                  <TrashIcon />
                </button>
              </span>
            </li>
          ))}

          {/* Full-width row that opens the Add expense modal. */}
          <li className="p-0">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex w-full items-center gap-2 border-t border-amber-200/60 bg-linear-to-r from-amber-50/60 to-amber-100/30 px-5 py-3 text-left text-sm font-medium text-amber-900 transition-colors hover:from-amber-100/60 hover:to-amber-100/40"
            >
              <svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add expense
            </button>
          </li>
        </ul>

        <div className="flex items-center justify-between border-t border-amber-900/10 px-5 py-3 text-sm text-amber-900/60">
          <span>
            Showing {shownExpenses.length} of {visibleExpenses.length} expenses
          </span>
          <span>
            Total{" "}
            <span className="font-semibold tabular-nums text-zinc-900">
              {currency.format(total)}
            </span>
          </span>
        </div>
      </div>
      </div>

      <div className="w-full shrink-0 lg:w-[380px]">
        <SpendingCharts expenses={expenses} anchorMonth={periodKey} />
      </div>

      {showAddModal && (
        <AddExpenseModal
          form={form}
          categories={categories}
          submitting={submitting}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          onSubmit={handleSubmit}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </main>
  );
}

// Modal dialog for adding a new expense. Mirrors the budget sheet's "Add row"
// modal styling and keeps the Category dropdown choices. The parent owns the
// form state so submit reuses the existing create logic.
function AddExpenseModal({
  form,
  categories,
  submitting,
  onChange,
  onSubmit,
  onClose,
}: {
  form: typeof emptyForm;
  categories: string[];
  submitting: boolean;
  onChange: (patch: Partial<typeof emptyForm>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  // Close on Escape for quick keyboard dismissal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fieldClass =
    "w-full rounded-xl border border-amber-900/15 bg-amber-50/40 px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm transition-colors placeholder:text-amber-900/30 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add expense"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-zinc-900">
              Add expense
            </h3>
            <p className="mt-0.5 text-sm text-amber-900/60">Variable Expenses</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-amber-900/5 hover:text-amber-900"
          >
            <svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-zinc-900">
                Description
              </span>
              <input
                type="text"
                autoFocus
                value={form.description}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder="e.g. Weekly groceries"
                className={fieldClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-900">Category</span>
              <BudgetDropdown
                value={form.category}
                options={categories}
                onChange={(v) => onChange({ category: v })}
                placeholder="Select a category"
                ariaLabel="Category"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-900">
                Amount (€)
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.amount}
                onChange={(e) => onChange({ amount: e.target.value })}
                placeholder="0.00"
                className={fieldClass}
              />
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-zinc-900">Date</span>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => onChange({ date: e.target.value })}
                className={fieldClass}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-amber-900 to-amber-700 px-4 py-3 text-sm font-semibold text-amber-50 shadow-md shadow-amber-900/20 transition-all hover:from-amber-800 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {submitting ? "Adding…" : "Add expense"}
          </button>
        </form>
      </div>
    </div>
  );
}
