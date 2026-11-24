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
  getMe,
  getSavings,
  getSavingsFunds,
  getUserDoc,
} from "@/lib/server-api";
import { addMonths, remainingBalance } from "../debts/schedule";

// The LifeLedger dashboard: a read-only, at-a-glance roll-up of money, habits
// and the year ahead. It's a Server Component — it loads everything in parallel
// on the server and renders static markup with links into each area.

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

const pad = (n: number) => String(n).padStart(2, "0");
const currentMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

// --- Shared palette (kept in one place so every section stays on-brand) ---
const C = {
  green: "#2f6a4a",
  rust: "#c0492f",
  yellow: "#d4a24a",
  blue: "#3a7ca5",
  dark: "#2c2420",
  pink: "#b65a84",
  teal: "#3a8a7a",
  stone: "#8a7f72",
};

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function shortMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
  });
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

// Whole months from `from` to `to` ("YYYY-MM"), negative if `to` is earlier.
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

// The last `n` "YYYY-MM" months ending with the current one (oldest first).
function lastMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return out;
}

// Greeting that follows the clock, matching the screenshots' "Good morning".
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// Friendly titles + accent colours for each budget section prefix.
const SECTION_META: Record<string, { title: string; color: string }> = {
  fix: { title: "Fixed Costs", color: C.green },
  variable: { title: "Variable Costs", color: C.rust },
  raten: { title: "Installments", color: C.yellow },
  sinking: { title: "Sinking Funds", color: C.blue },
  savings: { title: "Savings", color: C.teal },
  birthdays: { title: "Birthdays", color: C.pink },
  others: { title: "Others", color: C.stone },
};

function sectionTitle(id: string): string {
  if (SECTION_META[id]) return SECTION_META[id].title;
  const name = id.startsWith("table") ? id.replace(/^table/, "") : id;
  return (
    name
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || "Other"
  );
}

function sectionColor(id: string): string {
  return SECTION_META[id]?.color ?? C.stone;
}

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

function keyToLabel(entryKey: string, legacy: Record<string, string>): string {
  const id = entryKey.slice(entryKey.indexOf(":") + 1);
  if (legacy[id]) return legacy[id];
  const spaced = id.replace(/[-_]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function sumAllMonths(row: Record<string, number> | undefined): number {
  if (!row) return 0;
  return Object.values(row).reduce((a, b) => a + b, 0);
}

function buildBalances(
  prefix: "savings" | "investments",
  legacy: Record<string, string>,
  catalog: string[],
  breakdown: Record<string, Record<string, number>>,
  transactions: { name: string; amount: number }[],
): { label: string; balance: number }[] {
  const keys = Object.keys(breakdown).filter((k) => k.startsWith(`${prefix}:`));
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

  return labels
    .map((label) => {
      const lower = label.toLowerCase();
      const planned = keys
        .filter((k) => keyToLabel(k, legacy).toLowerCase() === lower)
        .reduce((sum, k) => sum + sumAllMonths(breakdown[k]), 0);
      const spent = transactions
        .filter((t) => t.name.toLowerCase() === lower)
        .reduce((sum, t) => sum + t.amount, 0);
      return { label, balance: planned - spent };
    })
    .filter((f) => Math.abs(f.balance) > 0.005);
}

// --- Year-calendar helpers (public holidays for Berlin, derived from Easter) ---
type EventType = "holiday" | "birthday" | "vacation" | "sick";
type CalEvent = {
  date: string;
  type: EventType;
  label: string;
  allowance?: "current" | "previous";
};

const daysInMonth = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();
const isWeekendISO = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`).getDay();
  return d === 0 || d === 6;
};

function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month: month - 1, day };
}

function berlinHolidays(year: number): CalEvent[] {
  const e = easterSunday(year);
  const easter = new Date(year, e.month, e.day);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const offset = (days: number) => {
    const d = new Date(easter);
    d.setDate(d.getDate() + days);
    return iso(d);
  };
  const fixed = (month: number, day: number) =>
    `${year}-${pad(month + 1)}-${pad(day)}`;
  const items: Array<{ date: string; label: string }> = [
    { date: fixed(0, 1), label: "Neujahr" },
    { date: offset(-2), label: "Karfreitag" },
    { date: offset(1), label: "Ostermontag" },
    { date: fixed(4, 1), label: "Tag der Arbeit" },
    { date: offset(39), label: "Christi Himmelfahrt" },
    { date: offset(50), label: "Pfingstmontag" },
    { date: fixed(9, 3), label: "Tag der Deutschen Einheit" },
    { date: fixed(11, 25), label: "1. Weihnachtstag" },
    { date: fixed(11, 26), label: "2. Weihnachtstag" },
  ];
  if (year >= 2019) {
    items.push({ date: fixed(2, 8), label: "Internationaler Frauentag" });
  }
  return items.map((it) => ({
    date: it.date,
    type: "holiday" as const,
    label: it.label,
  }));
}

const EVENT_COLOR: Record<EventType, string> = {
  holiday: "#c0392b",
  birthday: C.pink,
  vacation: C.blue,
  sick: C.yellow,
};
const EVENT_LABEL: Record<EventType, string> = {
  holiday: "Public holiday",
  birthday: "Birthday",
  vacation: "Vacation",
  sick: "Sick day",
};
const EVENT_ORDER: EventType[] = ["holiday", "birthday", "vacation", "sick"];

// --- Habit scheduling ---
function isDue(h: Habit, iso: string): boolean {
  if (h.frequency === "weekdays") {
    const dow = new Date(`${iso}T00:00:00`).getDay();
    return h.weekdays?.includes(dow) ?? false;
  }
  return true; // daily & weekly show as a daily cell on the grid
}

// --- Streaks (schedule-aware) ---
// Day index = whole days since the Unix epoch, computed in UTC so consecutive
// calendar days always differ by exactly 1 regardless of daylight-saving shifts.
const dayIndex = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};
// Today's day index, from the local calendar date.
const todayIndex = (): number => {
  const d = new Date();
  return dayIndex(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
};
// Weekday (0=Sun..6=Sat) for a day index. Epoch day 0 (1970-01-01) was a Thursday.
const weekdayOfIndex = (idx: number): number => (((idx % 7) + 4) % 7 + 7) % 7;
// Monday-based week number for a day index (epoch day 4 was the first Monday).
const weekIndex = (idx: number): number => Math.floor((idx - 4) / 7);

// Whether a habit is scheduled on a given day index. Daily habits run every day;
// "weekdays" habits only on their chosen weekdays. (Weekly habits are measured
// per week, not per day, so they never gate on a single day here.)
function isScheduledIndex(h: Habit, idx: number): boolean {
  if (h.frequency === "weekdays") {
    return h.weekdays?.includes(weekdayOfIndex(idx)) ?? false;
  }
  return true;
}

function currentStreak(h: Habit, checkins: string[]): number {
  const done = new Set(checkins.map(dayIndex));
  if (h.frequency === "weekly") return currentWeeklyStreak(done);
  if (h.frequency === "weekdays" && !h.weekdays?.length) return 0;

  const today = todayIndex();
  // Most recent scheduled day on or before today.
  let idx = today;
  while (!isScheduledIndex(h, idx)) idx--;
  // Grace for today: a scheduled occurrence that just hasn't been done *yet*
  // shouldn't break the streak, so measure from the previous occurrence instead.
  if (idx === today && !done.has(idx)) {
    idx--;
    while (!isScheduledIndex(h, idx)) idx--;
  }
  let streak = 0;
  while (done.has(idx)) {
    streak++;
    idx--;
    while (!isScheduledIndex(h, idx)) idx--;
  }
  return streak;
}

// Current streak for weekly habits: consecutive calendar weeks (Monday-based)
// that each contain at least one check-in, with grace for the current week.
function currentWeeklyStreak(done: Set<number>): number {
  const weeks = new Set<number>();
  for (const idx of done) weeks.add(weekIndex(idx));
  let w = weekIndex(todayIndex());
  if (!weeks.has(w)) w--;
  let streak = 0;
  while (weeks.has(w)) {
    streak++;
    w--;
  }
  return streak;
}

function longestStreak(h: Habit, checkins: string[]): number {
  const done = new Set(checkins.map(dayIndex));
  if (h.frequency === "weekly") {
    const weeks = [...new Set([...done].map(weekIndex))].sort((a, b) => a - b);
    return longestRun(weeks);
  }
  if (h.frequency === "weekdays" && !h.weekdays?.length) return 0;

  // Longest run of consecutive *scheduled* days that were all checked in, so a
  // weekend never breaks a Mon–Fri habit's streak.
  const indices = [...done]
    .filter((idx) => isScheduledIndex(h, idx))
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const idx of indices) {
    if (prev !== null) {
      let p = idx - 1;
      while (!isScheduledIndex(h, p)) p--;
      run = p === prev ? run + 1 : 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prev = idx;
  }
  return best;
}

// Longest run of consecutive integers in a sorted, de-duplicated list.
function longestRun(sorted: number[]): number {
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const n of sorted) {
    run = prev !== null && n - prev === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  return best;
}

// Travel plan document shape (only the fields the dashboard reads).
type TripItem = { label: string; budget: number; flight?: boolean; status?: string };
type Destination = {
  city: string;
  country?: string;
  month: string;
  items: TripItem[];
};

export default async function OverviewPage() {
  const month = currentMonth();
  const todayStr = today();
  const year = new Date().getFullYear();
  const months6 = lastMonths(6);

  // Load everything in parallel. Any single section degrades to empty data
  // rather than failing the whole page.
  const [
    me,
    income,
    expenses,
    breakdown,
    savings,
    sales,
    debts,
    habits,
    savingsFunds,
    investmentHoldings,
    yearDoc,
    travelDoc,
    income6,
  ] = await Promise.all([
    getMe().catch(() => null),
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
    getUserDoc<CalEvent[]>("year-events").catch(() => null),
    getUserDoc<Destination[]>("travel-destinations").catch(() => null),
    Promise.all(
      lastMonths(6).map((m) => getIncome(m).catch(() => [] as Income[])),
    ),
  ]);

  const firstName = me?.firstName?.trim() || "there";

  // --- Income & spending (this month) ---
  const totalIncome = income.reduce((s, i) => s + i.amount, 0);
  const topSource = [...income].sort((a, b) => b.amount - a.amount)[0];

  const monthExpenses = expenses.filter((e) => e.date.startsWith(month));
  const totalSpent = monthExpenses.reduce((s, e) => s + e.amount, 0);

  // Variable-cost budget limit for the month (used for "left of" + top spending).
  const variableKeys = Object.keys(breakdown).filter((k) =>
    k.startsWith("variable:"),
  );
  const variableLimit = variableKeys.reduce(
    (s, k) => s + (breakdown[k][month] ?? 0),
    0,
  );

  // --- Budget allocation (this month) ---
  const sectionTotals = new Map<string, number>();
  for (const [key, mths] of Object.entries(breakdown)) {
    const amount = mths[month] ?? 0;
    if (!amount) continue;
    const section = key.split(":")[0];
    if (section === "investments") continue; // shown separately
    sectionTotals.set(section, (sectionTotals.get(section) ?? 0) + amount);
  }
  const allocations = [...sectionTotals.entries()]
    .map(([id, amount]) => ({
      id,
      title: sectionTitle(id),
      color: sectionColor(id),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
  const assigned = allocations.reduce((s, a) => s + a.amount, 0);
  const leftToAssign = totalIncome - assigned;
  const assignedPct =
    totalIncome > 0 ? Math.round((assigned / totalIncome) * 100) : 0;

  // --- Top spending: variable categories against their budget limits ---
  const spentByCategory = new Map<string, number>();
  for (const e of monthExpenses) {
    const key = e.category.toLowerCase();
    spentByCategory.set(key, (spentByCategory.get(key) ?? 0) + e.amount);
  }
  const limitByCategory = new Map<string, { label: string; limit: number }>();
  for (const k of variableKeys) {
    const label = keyToLabel(k, {});
    const limit = breakdown[k][month] ?? 0;
    if (limit <= 0) continue;
    limitByCategory.set(label.toLowerCase(), { label, limit });
  }
  const topSpending = [...limitByCategory.values()]
    .map(({ label, limit }) => {
      const spent = spentByCategory.get(label.toLowerCase()) ?? 0;
      return { label, spent, limit };
    })
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5);
  // Fall back to raw top categories when no variable limits are configured.
  const topCategories = [...spentByCategory.entries()]
    .map(([label, spent]) => ({ label, spent }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5);

  // --- Savings & investment balances (all-time) ---
  const fundBalances = buildBalances(
    "savings",
    SAVINGS_LEGACY_LABELS,
    savingsFunds,
    breakdown,
    savings,
  );
  const totalSaved = fundBalances.reduce((s, f) => s + f.balance, 0);
  const fundMax = fundBalances.reduce((m, f) => Math.max(m, f.balance), 0);

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
    .slice(0, 5);

  // --- Net worth ---
  const netWorth = totalSaved + totalInvested - totalOwed;

  // --- Habits ---
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return {
      iso,
      dow: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()],
      day: d.getDate(),
    };
  });
  const habitRows = habits.map((h) => {
    const set = new Set(h.checkins);
    return {
      habit: h,
      set,
      streak: currentStreak(h, h.checkins),
      best: longestStreak(h, h.checkins),
    };
  });
  const dueToday = habits.filter((h) => isDue(h, todayStr));
  const doneToday = dueToday.filter((h) => h.checkins.includes(todayStr)).length;
  // 7- and 14-day completion across all habits' due days.
  const windowStats = (days: number) => {
    let due = 0;
    let done = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      for (const h of habits) {
        if (!isDue(h, iso)) continue;
        due++;
        if (h.checkins.includes(iso)) done++;
      }
    }
    return { due, done };
  };
  const week = windowStats(7);
  const fortnight = windowStats(14);
  const weekPct = week.due > 0 ? Math.round((week.done / week.due) * 100) : 0;
  const longest = habitRows.reduce(
    (best, r) =>
      r.best > best.best
        ? { best: r.best, name: r.habit.name, frequency: r.habit.frequency }
        : best,
    { best: 0, name: "", frequency: "daily" as Habit["frequency"] },
  );

  // --- Travel fund: the nearest upcoming trip ---
  const destinations = travelDoc ?? [];
  const upcoming = destinations
    .filter((d) => d.month >= month)
    .sort((a, b) => a.month.localeCompare(b.month));
  const trip = upcoming[0];
  let tripView: {
    dest: Destination;
    total: number;
    saved: number;
    monthsToGo: number;
    perMonth: number;
    items: TripItem[];
  } | null = null;
  if (trip) {
    const total = trip.items.reduce((s, it) => s + it.budget, 0);
    const saved = trip.items
      .filter((it) => it.status === "paid")
      .reduce((s, it) => s + it.budget, 0);
    const monthsToGo = Math.max(monthsBetween(month, trip.month), 0);
    const remaining = Math.max(total - saved, 0);
    const perMonth = monthsToGo > 0 ? remaining / monthsToGo : remaining;
    tripView = {
      dest: trip,
      total,
      saved,
      monthsToGo,
      perMonth,
      items: [...trip.items].sort((a, b) => b.budget - a.budget).slice(0, 3),
    };
  }

  // --- Year at a glance ---
  const userEvents = (yearDoc ?? []).filter((e) => e.date.startsWith(`${year}-`));
  const allEvents = [...berlinHolidays(year), ...userEvents];
  const eventsByDate = new Map<string, CalEvent[]>();
  for (const ev of allEvents) {
    const list = eventsByDate.get(ev.date) ?? [];
    list.push(ev);
    eventsByDate.set(ev.date, list);
  }
  const eventCounts: Record<EventType, number> = {
    holiday: allEvents.filter((e) => e.type === "holiday").length,
    birthday: allEvents.filter((e) => e.type === "birthday").length,
    vacation: allEvents.filter(
      (e) => e.type === "vacation" && !isWeekendISO(e.date),
    ).length,
    sick: allEvents.filter((e) => e.type === "sick" && !isWeekendISO(e.date))
      .length,
  };
  const comingUp = allEvents
    .filter((e) => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  // --- Cash flow (last 6 months) ---
  const expensesByMonth = new Map<string, number>();
  for (const e of expenses) {
    const m = e.date.slice(0, 7);
    expensesByMonth.set(m, (expensesByMonth.get(m) ?? 0) + e.amount);
  }
  const cashflow = months6.map((m, i) => ({
    month: m,
    label: shortMonth(m),
    income: income6[i].reduce((s, x) => s + x.amount, 0),
    out: expensesByMonth.get(m) ?? 0,
  }));
  const cashMax = cashflow.reduce(
    (mx, c) => Math.max(mx, c.income, c.out),
    0,
  );
  const thisCash = cashflow[cashflow.length - 1];
  const keptPct =
    thisCash && thisCash.income > 0
      ? Math.round(((thisCash.income - thisCash.out) / thisCash.income) * 100)
      : 0;

  // --- Recent transactions (this month: expenses out + income in) ---
  type Txn = {
    id: string;
    name: string;
    category: string;
    date: string;
    amount: number; // negative = money out
  };
  const txns: Txn[] = [
    ...monthExpenses.map((e) => ({
      id: `e${e.id}`,
      name: e.description || e.category,
      category: e.category,
      date: e.date,
      amount: -e.amount,
    })),
    ...income.map((i) => ({
      id: `i${i.id}`,
      name: i.source,
      category: "Income",
      date: `${i.month}-01`,
      amount: i.amount,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);

  const dateLine = new Date()
    .toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .toUpperCase();

  return (
    <main className="mx-auto flex w-full max-w-350 flex-1 flex-col gap-6 px-6 py-8 lg:px-10">
      {/* Greeting */}
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c06a3e]">
          {dateLine}
        </p>
        <h1 className="font-serif text-5xl font-semibold tracking-tight text-[#2c2420]">
          {greeting()}, {firstName}
        </h1>
        <p className="text-[15px] text-[#2c2420]/60">
          Your money, habits and year at a glance for {monthLabel(month)}.
        </p>
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Income this month"
          value={currency.format(totalIncome)}
          hint={topSource ? `${topSource.source}` : "No income logged"}
          color={C.green}
          href="/income"
        />
        <Kpi
          label="Spent this month"
          value={currency.format(totalSpent)}
          hint={
            variableLimit > 0
              ? `${currency.format(Math.max(variableLimit - totalSpent, 0))} left of ${currency.format(variableLimit)}`
              : `${monthExpenses.length} transaction${monthExpenses.length === 1 ? "" : "s"}`
          }
          color={C.rust}
          href="/"
        />
        <Kpi
          label="Total still owed"
          value={currency.format(totalOwed)}
          hint={`${activeDebts.length || "no"} active ${activeDebts.length === 1 ? "debt" : "debts"}`}
          color="#c0392b"
          href="/debts"
        />
        <Kpi
          label="Net worth"
          value={currency.format(netWorth)}
          hint="Savings + investments − debts"
          color={C.dark}
          href="/savings"
        />
      </section>

      {/* Allocation + top spending */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card
          title="Allocation this month"
          subtitle="Where your income is assigned"
          href="/budget"
          className="lg:col-span-2"
          right={
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2c2420]/40">
                Left to assign
              </p>
              <p
                className="font-serif text-2xl font-semibold tabular-nums"
                style={{ color: leftToAssign >= 0 ? C.green : C.rust }}
              >
                {currency.format(leftToAssign)}
              </p>
            </div>
          }
        >
          {allocations.length === 0 ? (
            <Empty>No budget saved for {monthLabel(month)} yet.</Empty>
          ) : (
            <>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#2c2420]/8">
                {allocations.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      width: `${totalIncome > 0 ? (a.amount / totalIncome) * 100 : 0}%`,
                      backgroundColor: a.color,
                    }}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs text-[#2c2420]/50">
                {currency.format(assigned)} of {currency.format(totalIncome)}{" "}
                assigned · {assignedPct}%
              </p>
              <ul className="mt-4 flex flex-col divide-y divide-[#2c2420]/8">
                {allocations.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: a.color }}
                      />
                      <span className="font-medium text-[#2c2420]/90">
                        {a.title}
                      </span>
                    </span>
                    <span className="flex items-center gap-4">
                      <span className="tabular-nums text-[#2c2420]/45">
                        {assigned > 0
                          ? Math.round((a.amount / assigned) * 100)
                          : 0}
                        %
                      </span>
                      <span className="w-24 text-right font-medium tabular-nums text-[#2c2420]">
                        {currency.format(a.amount)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card
          title="Top spending"
          subtitle="Variable costs against their limits"
          href="/"
        >
          {topSpending.length > 0 ? (
            <ul className="flex flex-col gap-3.5">
              {topSpending.map((s) => (
                <SpendRow key={s.label} {...s} />
              ))}
            </ul>
          ) : topCategories.length > 0 ? (
            <ul className="flex flex-col gap-3.5">
              {topCategories.map((s) => (
                <SpendRow key={s.label} label={s.label} spent={s.spent} limit={0} />
              ))}
            </ul>
          ) : (
            <Empty>No expenses logged this month.</Empty>
          )}
        </Card>
      </section>

      {/* Savings / Investments / Debts */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card
          title="Savings"
          subtitle={`${currency.format(totalSaved)} across funds`}
          href="/savings"
        >
          {fundBalances.length === 0 ? (
            <Empty>No savings tracked yet.</Empty>
          ) : (
            <ul className="flex flex-col gap-3.5">
              {fundBalances.map((f) => (
                <li key={f.label} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-[#2c2420]/90">
                      {f.label}
                    </span>
                    <span
                      className="font-medium tabular-nums"
                      style={{ color: C.green }}
                    >
                      {currency.format(f.balance)}
                    </span>
                  </div>
                  <Bar value={f.balance} max={fundMax} color={C.green} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Investments"
          subtitle={`${currency.format(totalInvested)} invested`}
          href="/investments"
        >
          {assetBalances.length === 0 ? (
            <Empty>No investments tracked yet.</Empty>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-[#2c2420]/8">
                {assetBalances.map((a) => (
                  <li
                    key={a.label}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <span className="font-medium text-[#2c2420]/90">
                      {a.label}
                    </span>
                    <span className="font-medium tabular-nums text-[#2c2420]">
                      {currency.format(a.balance)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-[#2c2420]/8">
                {assetBalances.map((a, i) => (
                  <div
                    key={a.label}
                    style={{
                      width: `${totalInvested > 0 ? (a.balance / totalInvested) * 100 : 0}%`,
                      backgroundColor: [C.green, C.blue, C.yellow, C.pink, C.teal][
                        i % 5
                      ],
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </Card>

        <Card
          title="Debts"
          subtitle={`${currency.format(totalOwed)} still owed`}
          href="/debts"
        >
          {activeDebts.length === 0 ? (
            <Empty>You&apos;re debt-free. Nice.</Empty>
          ) : (
            <ul className="flex flex-col gap-3.5">
              {activeDebts.map(({ debt, left }) => (
                <DebtRow key={debt.id} debt={debt} left={left} />
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Habits + travel */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card
          title="Habit tracker"
          subtitle="Last 14 days · tap a square to check in"
          href="/habits"
          className="lg:col-span-2"
          right={
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2c2420]/40">
                Today
              </p>
              <p className="font-serif text-2xl font-semibold tabular-nums text-[#2c2420]">
                {doneToday}/{dueToday.length}
              </p>
            </div>
          }
        >
          {habits.length === 0 ? (
            <Empty>No habits yet. Start tracking one.</Empty>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-x-0.5 border-spacing-y-1 text-sm">
                  <thead>
                    <tr>
                      <th className="w-40" />
                      {last14.map((d) => (
                        <th
                          key={d.iso}
                          className="text-center text-[10px] font-medium text-[#2c2420]/40"
                        >
                          <div>{d.dow}</div>
                          <div
                            className={
                              d.iso === todayStr
                                ? "font-semibold text-[#2c2420]"
                                : ""
                            }
                          >
                            {d.day}
                          </div>
                        </th>
                      ))}
                      <th className="pl-2 text-center text-[10px] font-medium text-[#2c2420]/40">
                        Streak
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {habitRows.map(({ habit, set, streak }) => (
                      <tr key={habit.id}>
                        <td className="truncate pr-2 text-[#2c2420]/85">
                          {habit.name}
                        </td>
                        {last14.map((d) => {
                          const checked = set.has(d.iso);
                          const due = isDue(habit, d.iso);
                          return (
                            <td key={d.iso} className="text-center">
                              <span
                                className="mx-auto flex h-6 w-6 items-center justify-center rounded-full"
                                style={{
                                  backgroundColor: checked
                                    ? habit.color
                                    : "transparent",
                                  boxShadow:
                                    !checked && due
                                      ? `inset 0 0 0 1.5px ${habit.color}55`
                                      : undefined,
                                  border:
                                    !checked && !due
                                      ? "1px solid rgba(44,36,32,0.08)"
                                      : undefined,
                                }}
                              >
                                {checked && (
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="white"
                                    strokeWidth="3.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="m5 13 4 4L19 7" />
                                  </svg>
                                )}
                              </span>
                            </td>
                          );
                        })}
                        <td className="pl-2 text-center">
                          <span className="inline-flex items-center gap-1 tabular-nums text-[#c06a3e]">
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <path d="M12 2c1 3-1 4-2 6s0 4 2 4 2-3 1-5c3 1 5 4 5 7a6 6 0 0 1-12 0c0-4 4-6 6-12Z" />
                            </svg>
                            {streak}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-4 border-t border-[#2c2420]/8 pt-4">
                <Stat label="Last 7 days" value={`${weekPct}%`} />
                <Stat
                  label="14-day check-ins"
                  value={`${fortnight.done}/${fortnight.due}`}
                />
                <Stat
                  label="Longest streak"
                  value={`${longest.best} ${
                    longest.frequency === "weekly"
                      ? longest.best === 1
                        ? "week"
                        : "weeks"
                      : longest.best === 1
                        ? "day"
                        : "days"
                  }`}
                  hint={longest.name}
                />
              </div>
            </>
          )}
        </Card>

        <Card title="Travel fund" href="/travel" subtitle={trip ? undefined : "No trips planned"}>
          {tripView ? (
            <div className="flex flex-col gap-4">
              <div
                className="relative overflow-hidden rounded-xl p-5 text-white"
                style={{ backgroundColor: "#214a3a" }}
              >
                <div className="flex items-start justify-between">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.5.5 0 0 0-.5.8l3.2 4.2-2 2-1.6-.4a.5.5 0 0 0-.5.8l2 2 2 2a.5.5 0 0 0 .8-.5l-.4-1.6 2-2 4.2 3.2a.5.5 0 0 0 .8-.5Z" />
                  </svg>
                  <span className="text-xs text-white/70">
                    {tripView.monthsToGo} month{tripView.monthsToGo === 1 ? "" : "s"} to go
                  </span>
                </div>
                <p className="mt-3 font-serif text-3xl font-semibold tabular-nums">
                  {currency.format(tripView.perMonth)}
                </p>
                <p className="text-sm text-white/70">to save each month</p>
              </div>
              <div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-[#2c2420]/90">
                    {tripView.dest.city}
                    {tripView.dest.country ? `, ${tripView.dest.country}` : ""} ·{" "}
                    {monthLabel(tripView.dest.month)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-[#2c2420]/50">
                  <span>Saved</span>
                  <span className="tabular-nums">
                    {currency.format(tripView.saved)} /{" "}
                    {currency.format(tripView.total)}
                  </span>
                </div>
                <Bar
                  value={tripView.saved}
                  max={tripView.total}
                  color={C.green}
                  className="mt-1.5"
                />
              </div>
              <ul className="flex flex-col divide-y divide-[#2c2420]/8">
                {tripView.items.map((it) => (
                  <li
                    key={it.label}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="text-[#2c2420]/80">{it.label}</span>
                    <span className="tabular-nums text-[#2c2420]/60">
                      {currency.format(it.budget)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Empty>Plan a trip to see your savings target.</Empty>
          )}
        </Card>
      </section>

      {/* Year at a glance */}
      <Card
        title={`Year at a Glance · ${year}`}
        subtitle={`${eventCounts.vacation} vacation day${eventCounts.vacation === 1 ? "" : "s"} · ${eventCounts.sick} sick day${eventCounts.sick === 1 ? "" : "s"}`}
        href="/year"
      >
        <div className="flex flex-col gap-6 xl:flex-row">
          <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, m) => (
              <MiniMonth
                key={m}
                year={year}
                monthIdx={m}
                eventsByDate={eventsByDate}
                todayStr={todayStr}
              />
            ))}
          </div>
          <aside className="flex shrink-0 flex-col gap-5 xl:w-52 xl:border-l xl:border-[#2c2420]/8 xl:pl-6">
            <ul className="flex flex-col gap-2">
              {EVENT_ORDER.map((t) => (
                <li
                  key={t}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: EVENT_COLOR[t] }}
                    />
                    <span className="text-[#2c2420]/75">{EVENT_LABEL[t]}</span>
                  </span>
                  <span className="tabular-nums text-[#2c2420]/50">
                    {eventCounts[t]}
                  </span>
                </li>
              ))}
            </ul>
            {comingUp.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2c2420]/40">
                  Coming up
                </p>
                <ul className="flex flex-col gap-2">
                  {comingUp.map((e) => (
                    <li
                      key={`${e.date}-${e.label}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: EVENT_COLOR[e.type] }}
                        />
                        <span className="truncate text-[#2c2420]/80">
                          {e.label}
                        </span>
                      </span>
                      <span className="shrink-0 pl-2 tabular-nums text-[#2c2420]/45">
                        {shortDate(e.date)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </Card>

      {/* Cash flow + recent transactions */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card
          title="Cash flow"
          subtitle="Income vs. money out, last 6 months"
          href="/income"
          className="lg:col-span-2"
          right={
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2c2420]/40">
                Kept in {thisCash ? thisCash.label : ""}
              </p>
              <p
                className="font-serif text-2xl font-semibold tabular-nums"
                style={{ color: keptPct >= 0 ? C.green : C.rust }}
              >
                {keptPct}%
              </p>
            </div>
          }
        >
          <div className="flex h-40 items-end justify-between gap-3 pt-2">
            {cashflow.map((c) => (
              <div
                key={c.month}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <div className="flex h-32 w-full items-end justify-center gap-1">
                  <div
                    className="w-1/2 rounded-t"
                    style={{
                      height: `${cashMax > 0 ? (c.income / cashMax) * 100 : 0}%`,
                      backgroundColor: C.green,
                    }}
                    title={`Income ${currency.format(c.income)}`}
                  />
                  <div
                    className="w-1/2 rounded-t"
                    style={{
                      height: `${cashMax > 0 ? (c.out / cashMax) * 100 : 0}%`,
                      backgroundColor: C.rust,
                    }}
                    title={`Money out ${currency.format(c.out)}`}
                  />
                </div>
                <span className="text-[11px] text-[#2c2420]/45">{c.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 border-t border-[#2c2420]/8 pt-3 text-xs text-[#2c2420]/55">
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: C.green }}
              />
              Income
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: C.rust }}
              />
              Money out
            </span>
          </div>
        </Card>

        <Card
          title="Recent transactions"
          subtitle="This month"
          href="/"
          className="lg:col-span-3"
        >
          {txns.length === 0 ? (
            <Empty>No transactions this month.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-[#2c2420]/8">
              {txns.map((t) => {
                const incoming = t.amount >= 0;
                return (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 py-2.5 text-sm"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: incoming ? "#dfece3" : "#f3e3d8",
                        color: incoming ? C.green : C.rust,
                      }}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {incoming ? (
                          <>
                            <line x1="17" y1="7" x2="7" y2="17" />
                            <polyline points="7 7 7 17 17 17" />
                          </>
                        ) : (
                          <>
                            <line x1="7" y1="17" x2="17" y2="7" />
                            <polyline points="7 7 17 7 17 17" />
                          </>
                        )}
                      </svg>
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-[#2c2420]/90">
                        {t.name}
                      </span>
                      <span className="truncate text-xs text-[#2c2420]/45">
                        {t.category}
                      </span>
                    </span>
                    <span className="ml-auto pr-3 text-xs tabular-nums text-[#2c2420]/45">
                      {shortDate(t.date)}
                    </span>
                    <span
                      className="w-24 text-right font-medium tabular-nums"
                      style={{ color: incoming ? C.green : C.rust }}
                    >
                      {incoming ? "+" : "−"}
                      {currency.format(Math.abs(t.amount))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <p className="pb-2 text-center text-xs text-[#2c2420]/35">
        LifeLedger
      </p>
    </main>
  );
}

// --- Presentational helpers ---

function Kpi({
  label,
  value,
  hint,
  color,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  color: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-2xl border border-[#2c2420]/8 bg-[#fffdf8] p-5 shadow-sm transition hover:shadow-md"
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#2c2420]/40">
        {label}
      </span>
      <span
        className="font-serif text-[32px] font-semibold leading-tight tabular-nums"
        style={{ color }}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-[#2c2420]/45">{hint}</span>}
    </Link>
  );
}

function Card({
  title,
  subtitle,
  href,
  right,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-4 rounded-2xl border border-[#2c2420]/8 bg-[#fffdf8] p-6 shadow-sm ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="font-serif text-xl font-semibold text-[#2c2420]">
            {href ? (
              <Link href={href} className="hover:text-[#c06a3e]">
                {title}
              </Link>
            ) : (
              title
            )}
          </h2>
          {subtitle && (
            <p className="text-sm text-[#2c2420]/50">{subtitle}</p>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Bar({
  value,
  max,
  color,
  className,
}: {
  value: number;
  max: number;
  color: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-[#2c2420]/8 ${className ?? ""}`}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

function SpendRow({
  label,
  spent,
  limit,
}: {
  label: string;
  spent: number;
  limit: number;
}) {
  const pct = limit > 0 ? spent / limit : 0;
  let badge: { text: string; color: string } | null = null;
  let barColor = C.green;
  if (limit > 0) {
    if (pct > 1) {
      badge = { text: "Over", color: C.rust };
      barColor = C.rust;
    } else if (pct >= 0.8) {
      badge = { text: "Close", color: C.yellow };
      barColor = C.yellow;
    } else {
      badge = { text: "On track", color: C.green };
      barColor = C.green;
    }
  }
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="font-medium text-[#2c2420]/90">{label}</span>
          {badge && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ backgroundColor: `${badge.color}22`, color: badge.color }}
            >
              {badge.text}
            </span>
          )}
        </span>
        <span className="shrink-0 tabular-nums text-[#2c2420]/60">
          {currency.format(spent)}
          {limit > 0 && (
            <span className="text-[#2c2420]/35"> / {currency.format(limit)}</span>
          )}
        </span>
      </div>
      <Bar value={spent} max={limit > 0 ? limit : spent} color={barColor} />
    </li>
  );
}

function DebtRow({ debt, left }: { debt: Debt; left: number }) {
  const isInstallment = debt.kind === "installment";
  const paid = Math.max(debt.totalAmount - left, 0);
  const sub = isInstallment
    ? `Installment ${debt.paidMonths} of ${debt.termMonths} paid`
    : "One-time payment";
  const when = isInstallment
    ? `Next ${shortMonth(addMonths(debt.startMonth, debt.paidMonths))}`
    : `Due ${shortMonth(debt.startMonth)}`;
  return (
    <li>
      <Link href={`/debts/${debt.id}`} className="group flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium text-[#2c2420]/90 group-hover:text-[#c06a3e]">
            {debt.name}
          </span>
          <span className="font-medium tabular-nums" style={{ color: "#c0392b" }}>
            {currency.format(left)}
          </span>
        </div>
        <Bar
          value={paid}
          max={debt.totalAmount}
          color={isInstallment ? C.yellow : C.rust}
        />
        <div className="flex items-center justify-between text-xs text-[#2c2420]/45">
          <span>{sub}</span>
          <span>{when}</span>
        </div>
      </Link>
    </li>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#2c2420]/40">
        {label}
      </span>
      <span className="font-serif text-2xl font-semibold tabular-nums text-[#2c2420]">
        {value}
      </span>
      {hint && <span className="truncate text-xs text-[#2c2420]/45">{hint}</span>}
    </div>
  );
}

function MiniMonth({
  year,
  monthIdx,
  eventsByDate,
  todayStr,
}: {
  year: number;
  monthIdx: number;
  eventsByDate: Map<string, CalEvent[]>;
  todayStr: string;
}) {
  const monthName = new Date(year, monthIdx, 1).toLocaleDateString("en-GB", {
    month: "short",
  });
  const first = new Date(year, monthIdx, 1).getDay(); // 0 = Sunday
  const offset = (first + 6) % 7; // Monday-first grid
  const total = daysInMonth(year, monthIdx);
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-[#2c2420]/70">{monthName}</p>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <span key={`b${i}`} className="h-4" />;
          const iso = `${year}-${pad(monthIdx + 1)}-${pad(day)}`;
          const events = eventsByDate.get(iso);
          const top = events
            ? EVENT_ORDER.find((t) => events.some((e) => e.type === t))
            : undefined;
          const isToday = iso === todayStr;
          return (
            <span
              key={iso}
              title={events?.map((e) => e.label).join(", ")}
              className="flex h-4 items-center justify-center rounded-[3px] text-[9px] tabular-nums"
              style={{
                backgroundColor: top ? EVENT_COLOR[top] : "transparent",
                color: top ? "white" : "rgba(44,36,32,0.5)",
                boxShadow: isToday ? "inset 0 0 0 1.5px #c06a3e" : undefined,
              }}
            >
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-sm text-[#2c2420]/45">{children}</p>
  );
}
