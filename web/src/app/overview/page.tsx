import Link from "next/link";
import type {
  Debt,
  Expense,
  Habit,
  Income,
  InvestmentSale,
  Saving,
} from "@/lib/types";
import {
  getBudgetBreakdown,
  getDebts,
  getExpenses,
  getHabits,
  getIncome,
  getInvestmentHoldings,
  getInvestmentSales,
  getSavings,
  getSavingsFunds,
} from "@/lib/server-api";
import { remainingBalance } from "../debts/schedule";

// The Workspace dashboard: a read-only, at-a-glance roll-up of every section
// (income, spending, budget allocation, savings, investments, debts, habits)
// for the current month. It's a Server Component — it loads everything in
// parallel on the server and renders static markup with links into each area.

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

const currentMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

// Friendly titles for each budget section prefix ("section:row" keys).
const SECTION_TITLES: Record<string, string> = {
  fix: "Fixed Costs",
  variable: "Variable Costs",
  savings: "Savings",
  investments: "Investments",
  sinking: "Sinking Funds",
  raten: "Installments",
  birthdays: "Birthdays",
  others: "Others",
};

function sectionTitle(id: string): string {
  if (SECTION_TITLES[id]) return SECTION_TITLES[id];
  // Custom tables are stored under "table:<id>"; fall back to a title-cased id.
  const name = id.startsWith("table") ? id.replace(/^table/, "") : id;
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    || "Other";
}

// Friendly labels for funds/holdings that used to ship as built-ins, so a
// returning account's budget rows keep a readable name. Kept in sync with the
// Savings and Investments tabs.
const SAVINGS_LEGACY_LABELS: Record<string, string> = {
  emergency: "Emergency Fund",
  travel: "Travel Fund",
  ph: "PH Fund",
};
const INVESTMENT_LEGACY_LABELS: Record<string, string> = {
  ethereum: "Ethereum",
  sp500: "S&P 500",
  xrp: "XRP",
};

// Turn a budget "<section>:<id>" entry key into a display label, matching the
// tabs' keyToLabel helpers.
function keyToLabel(
  entryKey: string,
  legacy: Record<string, string>,
): string {
  const id = entryKey.slice(entryKey.indexOf(":") + 1);
  if (legacy[id]) return legacy[id];
  const spaced = id.replace(/[-_]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Sum every month of a breakdown row (all-time deposits/buys for a key).
function sumAllMonths(row: Record<string, number> | undefined): number {
  if (!row) return 0;
  return Object.values(row).reduce((a, b) => a + b, 0);
}

// Build a fund/holding balance list the same way the Savings and Investments
// tabs build their dropdowns: the user's catalog, plus any name that already has
// budget rows or recorded transactions, so the Overview matches those tabs.
function buildBalances(
  prefix: "savings" | "investments",
  legacy: Record<string, string>,
  catalog: string[],
  breakdown: Record<string, Record<string, number>>,
  transactions: { name: string; amount: number }[],
): { label: string; balance: number }[] {
  const keys = Object.keys(breakdown).filter((k) =>
    k.startsWith(`${prefix}:`),
  );
  const labels: string[] = [];
  const seen = new Set<string>();
  const push = (label: string) => {
    const lower = label.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    labels.push(label);
  };
  catalog.forEach(push);
  keys.forEach((k) => push(keyToLabel(k, legacy)));
  transactions.forEach((t) => push(t.name));

  return labels.map((label) => {
    const lower = label.toLowerCase();
    const planned = keys
      .filter((k) => keyToLabel(k, legacy).toLowerCase() === lower)
      .reduce((sum, k) => sum + sumAllMonths(breakdown[k]), 0);
    const spent = transactions
      .filter((t) => t.name.toLowerCase() === lower)
      .reduce((sum, t) => sum + t.amount, 0);
    return { label, balance: planned - spent };
  });
}

export default async function OverviewPage() {
  const month = currentMonth();

  // Load everything in parallel. If any one section's API is unreachable we
  // degrade gracefully to empty data rather than failing the whole page.
  const [
    income,
    expenses,
    breakdown,
    savings,
    sales,
    debts,
    habits,
    savingsFunds,
    investmentHoldings,
  ] = await Promise.all([
    getIncome(month).catch(() => [] as Income[]),
    getExpenses().catch(() => [] as Expense[]),
    getBudgetBreakdown().catch(
      () => ({}) as Record<string, Record<string, number>>,
    ),
    getSavings().catch(() => [] as Saving[]),
    getInvestmentSales().catch(() => [] as InvestmentSale[]),
    getDebts().catch(() => [] as Debt[]),
    getHabits().catch(() => [] as Habit[]),
    getSavingsFunds().catch(() => [] as string[]),
    getInvestmentHoldings().catch(() => [] as string[]),
  ]);

  // --- Income & spending (this month) ---
  const totalIncome = income.reduce((s, i) => s + i.amount, 0);

  const monthExpenses = expenses.filter((e) => e.date.startsWith(month));
  const totalSpent = monthExpenses.reduce((s, e) => s + e.amount, 0);

  // Top spending categories this month.
  const byCategory = new Map<string, number>();
  for (const e of monthExpenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  }
  const topCategories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const topCategoryMax = topCategories.reduce((m, [, v]) => Math.max(m, v), 0);

  // --- Budget allocation (this month) ---
  const sectionTotals = new Map<string, number>();
  for (const [key, months] of Object.entries(breakdown)) {
    const amount = months[month] ?? 0;
    if (!amount) continue;
    const section = key.split(":")[0];
    // Investments are money you're putting to work, not spending — they're shown
    // separately under the Investments panel, so leave them out of "Budgeted".
    if (section === "investments") continue;
    sectionTotals.set(section, (sectionTotals.get(section) ?? 0) + amount);
  }
  const allocations = [...sectionTotals.entries()]
    .map(([id, amount]) => ({ id, title: sectionTitle(id), amount }))
    .sort((a, b) => b.amount - a.amount);
  const allocationMax = allocations.reduce((m, a) => Math.max(m, a.amount), 0);

  // --- Savings & investment balances (all-time) ---
  const fundBalances = buildBalances(
    "savings",
    SAVINGS_LEGACY_LABELS,
    savingsFunds,
    breakdown,
    savings,
  );
  const totalSaved = fundBalances.reduce((s, f) => s + f.balance, 0);

  const assetBalances = buildBalances(
    "investments",
    INVESTMENT_LEGACY_LABELS,
    investmentHoldings,
    breakdown,
    sales,
  );
  const totalInvested = assetBalances.reduce((s, a) => s + a.balance, 0);

  // --- Debts ---
  const totalOwed = debts.reduce((s, d) => s + remainingBalance(d), 0);
  const activeDebts = debts
    .map((d) => ({ debt: d, left: remainingBalance(d) }))
    .filter((x) => x.left > 0)
    .sort((a, b) => b.left - a.left)
    .slice(0, 4);

  // --- Habits (today) ---
  const todayStr = today();
  const habitsDoneToday = habits.filter((h) =>
    h.checkins.includes(todayStr),
  ).length;

  return (
    <main className="mx-auto flex w-full max-w-none flex-1 flex-col gap-8 px-6 py-10 lg:px-12 xl:px-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Workspace
        </h1>
        <p className="text-sm text-amber-900/70">
          Your money at a glance for {monthLabel(month)}.
        </p>
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Income this month"
          value={currency.format(totalIncome)}
          tone="emerald"
          href="/income"
        />
        <KpiCard
          label="Spent this month"
          value={currency.format(totalSpent)}
          hint={`${monthExpenses.length} transaction${monthExpenses.length === 1 ? "" : "s"}`}
          tone="amber"
          href="/"
        />
        <KpiCard
          label="Total still owed"
          value={currency.format(totalOwed)}
          hint={`${activeDebts.length ? activeDebts.length : "no"} active ${activeDebts.length === 1 ? "debt" : "debts"}`}
          tone="rose"
          href="/debts"
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Allocation this month */}
        <Panel
          title="Allocation this month"
          subtitle="Where your budget is assigned"
          href="/budget"
          className="lg:col-span-2"
        >
          {allocations.length === 0 ? (
            <Empty>No budget saved for {monthLabel(month)} yet.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {allocations.map((a) => (
                <li key={a.id} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-zinc-800">{a.title}</span>
                    <span className="tabular-nums text-zinc-600">
                      {currency.format(a.amount)}
                    </span>
                  </div>
                  <Bar
                    value={a.amount}
                    max={allocationMax}
                    className="bg-amber-700"
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Top spending categories */}
        <Panel
          title="Top spending"
          subtitle="This month's categories"
          href="/"
        >
          {topCategories.length === 0 ? (
            <Empty>No expenses logged this month.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {topCategories.map(([category, amount]) => (
                <li key={category} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-zinc-800">
                      {category}
                    </span>
                    <span className="tabular-nums text-zinc-600">
                      {currency.format(amount)}
                    </span>
                  </div>
                  <Bar
                    value={amount}
                    max={topCategoryMax}
                    className="bg-rose-600"
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Savings */}
        <Panel
          title="Savings"
          subtitle={`${currency.format(totalSaved)} across funds`}
          href="/savings"
        >
          <BalanceList items={fundBalances} accent="text-emerald-700" />
        </Panel>

        {/* Investments */}
        <Panel
          title="Investments"
          subtitle={`${currency.format(totalInvested)} invested`}
          href="/investments"
        >
          <BalanceList items={assetBalances} accent="text-indigo-700" />
        </Panel>

        {/* Debts */}
        <Panel title="Debts" subtitle={`${currency.format(totalOwed)} owed`} href="/debts">
          {activeDebts.length === 0 ? (
            <Empty>You&apos;re debt-free. Nice.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {activeDebts.map(({ debt, left }) => {
                const paid = Math.max(debt.totalAmount - left, 0);
                return (
                  <li key={debt.id}>
                    <Link
                      href={`/debts/${debt.id}`}
                      className="group flex flex-col gap-1"
                    >
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium text-zinc-800 group-hover:text-amber-900">
                          {debt.name}
                        </span>
                        <span className="tabular-nums text-rose-700">
                          {currency.format(left)}
                        </span>
                      </div>
                      <Bar
                        value={paid}
                        max={debt.totalAmount}
                        className="bg-amber-700"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Habits strip */}
      <Panel
        title="Habits today"
        subtitle={`${habitsDoneToday} of ${habits.length} done`}
        href="/habits"
      >
        {habits.length === 0 ? (
          <Empty>No habits yet. Start tracking one.</Empty>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {habits.map((h) => {
              const done = h.checkins.includes(todayStr);
              return (
                <li
                  key={h.id}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                    done
                      ? "border-transparent bg-emerald-50 text-emerald-800"
                      : "border-amber-900/15 text-amber-900/60"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: done ? h.color : "transparent", boxShadow: done ? undefined : `inset 0 0 0 1.5px ${h.color}` }}
                  />
                  {h.name}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </main>
  );
}

// --- Presentational helpers ---

const TONES: Record<string, { ring: string; text: string }> = {
  emerald: { ring: "ring-emerald-600/20", text: "text-emerald-700" },
  amber: { ring: "ring-amber-700/20", text: "text-amber-800" },
  indigo: { ring: "ring-indigo-600/20", text: "text-indigo-700" },
  rose: { ring: "ring-rose-600/20", text: "text-rose-700" },
};

function KpiCard({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: keyof typeof TONES;
  href: string;
}) {
  const t = TONES[tone];
  return (
    <Link
      href={href}
      className={`flex flex-col gap-1 rounded-xl border border-amber-900/10 bg-white p-5 shadow-sm ring-1 ${t.ring} transition hover:shadow-md`}
    >
      <span className="text-xs font-medium uppercase tracking-wider text-amber-900/50">
        {label}
      </span>
      <span className={`text-3xl font-semibold tracking-tight tabular-nums ${t.text}`}>
        {value}
      </span>
      {hint && <span className="text-xs text-amber-900/50">{hint}</span>}
    </Link>
  );
}

function Panel({
  title,
  subtitle,
  href,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-4 rounded-xl border border-amber-900/15 bg-white p-6 shadow-sm ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          {subtitle && (
            <p className="text-sm text-amber-900/60">{subtitle}</p>
          )}
        </div>
        {href && (
          <Link
            href={href}
            className="shrink-0 text-sm font-medium text-amber-800 hover:text-amber-900"
          >
            View →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Bar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-amber-900/10">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function BalanceList({
  items,
  accent,
}: {
  items: { label: string; balance: number }[];
  accent: string;
}) {
  if (items.length === 0) {
    return <Empty>Nothing here yet.</Empty>;
  }
  return (
    <ul className="flex flex-col divide-y divide-amber-900/10">
      {items.map((it) => (
        <li
          key={it.label}
          className="flex items-center justify-between py-2.5 text-sm"
        >
          <span className="font-medium text-zinc-800">{it.label}</span>
          <span className={`tabular-nums font-semibold ${accent}`}>
            {currency.format(it.balance)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-sm text-amber-900/50">{children}</p>
  );
}
