"use client";

// Habit tracker: a monthly grid where each habit has one check-in box per day.
// Habits are stored per-user in the backend (via /api/habits). This component
// loads them from the server, then reads/writes through the API with optimistic
// UI updates. Styling follows the FinTracker amber/brown theme.
import { useEffect, useMemo, useState } from "react";
import type { Habit, HabitFrequency } from "@/lib/types";
import {
  createHabit,
  updateHabit,
  deleteHabit as apiDeleteHabit,
  addHabitCheckin,
  removeHabitCheckin,
} from "@/lib/api";
import BudgetDropdown from "../budget-dropdown";

// Old localStorage key, kept only so any habits saved on this device before the
// backend existed can be migrated once, then cleared.
const STORAGE_KEY = "habit-tracker:habits";

// Shape of the legacy localStorage habits, used only during migration.
type LocalHabit = {
  id?: string | number;
  name?: string;
  category?: string;
  color?: string;
  checkins?: string[];
};

// Suggestions offered in the category dropdown, merged with any the user adds.
const DEFAULT_CATEGORIES = [
  "Wellbeing",
  "Learning",
  "Money",
  "Health",
  "Mindfulness",
  "Home",
];

// Single-letter weekday labels, indexed by Date.getDay() (0 = Sunday).
const WEEKDAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];

// Soft, multi-hue chips so categories stay visually distinct while keeping the
// warm palette. Assigned deterministically from the category name.
const CHIP_PALETTE = [
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-800",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
  "bg-orange-100 text-orange-800",
];

function chipClass(category: string) {
  let h = 0;
  for (let i = 0; i < category.length; i++) {
    h = (h * 31 + category.charCodeAt(i)) >>> 0;
  }
  return CHIP_PALETTE[h % CHIP_PALETTE.length];
}

// Distinct per-habit accent colours. Each habit gets one so its check-in boxes,
// name dot, donut slice and leaderboard marker all share the same colour,
// making it obvious at a glance which habit is which.
const HABIT_PALETTE = [
  "#dc2626", // red
  "#2563eb", // blue
  "#16a34a", // green
  "#ea580c", // orange
  "#9333ea", // purple
  "#0d9488", // teal
  "#db2777", // pink
  "#ca8a04", // gold
];

// Resolve a habit's colour: use its saved colour, otherwise derive a stable one
// from its id so habits without a colour still look distinct and consistent.
function habitColor(h: Habit) {
  if (h.color) return h.color;
  const key = String(h.id);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return HABIT_PALETTE[hash % HABIT_PALETTE.length];
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;
const daysInMonth = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();

// Full weekday names indexed by Date.getDay() (0 = Sunday), used for schedule
// labels and the weekday picker.
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Schedule options offered in the Add/Edit modal.
const FREQUENCY_OPTIONS: { value: HabitFrequency; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Once a week" },
  { value: "weekdays", label: "Specific days" },
];

// A short human label for a habit's schedule, e.g. "Every day", "Once a week"
// or "Mon, Wed, Fri".
function frequencyLabel(h: Habit): string {
  if (h.frequency === "weekly") return "Once a week";
  if (h.frequency === "weekdays") {
    const days = [...h.weekdays]
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_SHORT[d]);
    return days.length ? days.join(", ") : "Specific days";
  }
  return "Every day";
}

// Whether a given weekday (0=Sun..6=Sat) is part of the habit's schedule. Daily
// and weekly habits count every day; "weekdays" habits only their chosen days.
function isScheduledDay(h: Habit, weekday: number): boolean {
  if (h.frequency === "weekdays") return h.weekdays.includes(weekday);
  return true;
}

type ModalState = { mode: "add" } | { mode: "edit"; habit: Habit } | null;

export default function HabitTracker({
  initialHabits,
}: {
  initialHabits: Habit[];
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [habits, setHabits] = useState<Habit[]>(initialHabits);
  const [mounted, setMounted] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  // On first client render, mark mounted (so the date-dependent grid renders
  // without a hydration mismatch) and run a one-time migration: if the backend
  // has no habits yet but this browser has habits saved under the old
  // localStorage key, push them to the backend so the user's existing logs
  // aren't lost, then clear the local copy.
  useEffect(() => {
    async function migrateLocalHabits() {
      try {
        if (initialHabits.length > 0) return;
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        const local = JSON.parse(stored) as LocalHabit[];
        if (!Array.isArray(local) || local.length === 0) return;

        const migrated: Habit[] = [];
        for (let i = 0; i < local.length; i++) {
          const lh = local[i];
          if (!lh || typeof lh.name !== "string" || lh.name.trim() === "") {
            continue;
          }
          const created = await createHabit({
            name: lh.name,
            category: typeof lh.category === "string" ? lh.category : "",
            color:
              typeof lh.color === "string" && lh.color
                ? lh.color
                : HABIT_PALETTE[i % HABIT_PALETTE.length],
            frequency: "daily",
            weekdays: [],
          });
          for (const date of lh.checkins ?? []) {
            if (typeof date === "string") {
              await addHabitCheckin(created.id, date);
              created.checkins.push(date);
            }
          }
          migrated.push(created);
        }
        if (migrated.length > 0) setHabits(migrated);
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // If migration fails, leave localStorage intact and keep backend data.
      }
    }

    void migrateLocalHabits();
    setMounted(true);
  }, [initialHabits]);

  const totalDays = daysInMonth(year, month);
  const days = useMemo(
    () => Array.from({ length: totalDays }, (_, i) => i + 1),
    [totalDays],
  );
  const monthPrefix = `${year}-${pad(month + 1)}-`;
  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const todayIso = isoDate(now.getFullYear(), now.getMonth(), now.getDate());

  // Days that have already happened: the whole month for past months, up to today
  // for the current month, nothing for future months. Only used for the "Needs
  // improvement" ranking, so it isn't skewed by days that haven't arrived yet.
  const lastCountedDay = (() => {
    const curY = now.getFullYear();
    const curM = now.getMonth();
    if (year > curY || (year === curY && month > curM)) return 0;
    if (year < curY || (year === curY && month < curM)) return totalDays;
    return now.getDate();
  })();

  // The days of the month that have already elapsed (1..lastCountedDay).
  const countedDays = useMemo(
    () => days.filter((day) => day <= lastCountedDay),
    [days, lastCountedDay],
  );

  // Per-habit count of check-ins that fall within the displayed month.
  const monthlyCount = (h: Habit) =>
    h.checkins.filter((d) => d.startsWith(monthPrefix)).length;

  // How many check-ins the habit is expected to complete for the whole month
  // given its schedule: every day, once per week, or once on each chosen weekday.
  const expectedCount = (h: Habit) => {
    if (h.frequency === "weekly") {
      const firstWeekday = new Date(year, month, 1).getDay();
      return Math.ceil((firstWeekday + totalDays) / 7);
    }
    if (h.frequency === "weekdays") {
      if (h.weekdays.length === 0) return 0;
      return days.filter((day) =>
        h.weekdays.includes(new Date(year, month, day).getDay()),
      ).length;
    }
    return totalDays;
  };

  // How many of the expected check-ins were actually completed this month.
  // Weekly habits count distinct weeks with any check-in; weekday habits count
  // check-ins on a scheduled weekday; daily habits count every check-in.
  const achievedCount = (h: Habit) => {
    const monthCheckins = h.checkins.filter((d) => d.startsWith(monthPrefix));
    if (h.frequency === "weekly") {
      const firstWeekday = new Date(year, month, 1).getDay();
      const weeks = new Set<number>();
      for (const iso of monthCheckins) {
        const day = Number(iso.slice(8, 10));
        weeks.add(Math.floor((firstWeekday + day - 1) / 7));
      }
      return weeks.size;
    }
    if (h.frequency === "weekdays") {
      return monthCheckins.filter((iso) => {
        const day = Number(iso.slice(8, 10));
        return h.weekdays.includes(new Date(year, month, day).getDay());
      }).length;
    }
    return monthCheckins.length;
  };

  // Same as expectedCount/achievedCount but only up to today, used solely for the
  // "Needs improvement" ranking so future days don't count against a habit.
  const expectedToDate = (h: Habit) => {
    if (lastCountedDay === 0) return 0;
    if (h.frequency === "weekly") {
      const firstWeekday = new Date(year, month, 1).getDay();
      return Math.ceil((firstWeekday + lastCountedDay) / 7);
    }
    if (h.frequency === "weekdays") {
      if (h.weekdays.length === 0) return 0;
      return countedDays.filter((day) =>
        h.weekdays.includes(new Date(year, month, day).getDay()),
      ).length;
    }
    return lastCountedDay;
  };

  const achievedToDate = (h: Habit) => {
    const monthCheckins = h.checkins.filter(
      (d) =>
        d.startsWith(monthPrefix) && Number(d.slice(8, 10)) <= lastCountedDay,
    );
    if (h.frequency === "weekly") {
      const firstWeekday = new Date(year, month, 1).getDay();
      const weeks = new Set<number>();
      for (const iso of monthCheckins) {
        const day = Number(iso.slice(8, 10));
        weeks.add(Math.floor((firstWeekday + day - 1) / 7));
      }
      return weeks.size;
    }
    if (h.frequency === "weekdays") {
      return monthCheckins.filter((iso) => {
        const day = Number(iso.slice(8, 10));
        return h.weekdays.includes(new Date(year, month, day).getDay());
      }).length;
    }
    return monthCheckins.length;
  };

  const totalCheckins = habits.reduce((sum, h) => sum + monthlyCount(h), 0);
  const totalDone = habits.reduce((sum, h) => sum + achievedCount(h), 0);
  const totalTarget = habits.reduce((sum, h) => sum + expectedCount(h), 0);
  const monthPct =
    totalTarget > 0 ? Math.round((totalDone / totalTarget) * 100) : 0;

  // Most consistent first, ranked by how much of each habit's schedule is done.
  const ranked = [...habits]
    .map((h) => {
      const target = expectedCount(h);
      const done = achievedCount(h);
      return {
        habit: h,
        done,
        target,
        pct: target > 0 ? Math.round((done / target) * 100) : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct);
  const topConsistent = ranked.filter((r) => r.done > 0).slice(0, 3);
  // Habits at or below 50% of their schedule so far (counting only elapsed days),
  // lowest completion first.
  const needsImprovement = [...habits]
    .map((h) => {
      const target = expectedToDate(h);
      const done = achievedToDate(h);
      return {
        habit: h,
        done,
        target,
        pct: target > 0 ? Math.round((done / target) * 100) : 0,
      };
    })
    .filter((r) => r.target > 0 && r.pct <= 50)
    .sort((a, b) => a.pct - b.pct);

  function goToMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  // Optimistically toggle the check-in, then persist; revert on failure.
  async function toggleCheckin(habitId: number, iso: string) {
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return;
    const willCheck = !habit.checkins.includes(iso);

    setHabits((prev) =>
      prev.map((h) =>
        h.id !== habitId
          ? h
          : {
              ...h,
              checkins: willCheck
                ? [...h.checkins, iso]
                : h.checkins.filter((d) => d !== iso),
            },
      ),
    );

    try {
      if (willCheck) await addHabitCheckin(habitId, iso);
      else await removeHabitCheckin(habitId, iso);
    } catch {
      // Revert the optimistic change if the request failed.
      setHabits((prev) =>
        prev.map((h) =>
          h.id !== habitId
            ? h
            : {
                ...h,
                checkins: willCheck
                  ? h.checkins.filter((d) => d !== iso)
                  : [...h.checkins, iso],
              },
        ),
      );
    }
  }

  async function addHabit(
    name: string,
    category: string,
    color: string,
    frequency: HabitFrequency,
    weekdays: number[],
  ) {
    const days = frequency === "weekdays" ? weekdays : [];
    try {
      const created = await createHabit({
        name: name.trim(),
        category: category.trim(),
        color,
        frequency,
        weekdays: days,
      });
      setHabits((prev) => [...prev, created]);
    } catch {
      // Ignore; the habit simply isn't added if the request failed.
    }
  }

  async function editHabit(
    id: number,
    name: string,
    category: string,
    color: string,
    frequency: HabitFrequency,
    weekdays: number[],
  ) {
    const previous = habits;
    const days = frequency === "weekdays" ? weekdays : [];
    setHabits((prev) =>
      prev.map((h) =>
        h.id === id
          ? {
              ...h,
              name: name.trim(),
              category: category.trim(),
              color,
              frequency,
              weekdays: days,
            }
          : h,
      ),
    );
    try {
      await updateHabit(id, {
        name: name.trim(),
        category: category.trim(),
        color,
        frequency,
        weekdays: days,
      });
    } catch {
      setHabits(previous);
    }
  }

  async function deleteHabit(id: number) {
    const previous = habits;
    setHabits((prev) => prev.filter((h) => h.id !== id));
    try {
      await apiDeleteHabit(id);
    } catch {
      setHabits(previous);
    }
  }

  const categoryOptions = useMemo(() => {
    const seen = new Set(DEFAULT_CATEGORIES);
    for (const h of habits) if (h.category) seen.add(h.category);
    return Array.from(seen);
  }, [habits]);

  // The grid highlights "today" and defaults to the current month, so it depends
  // on the client clock. Render a shell during SSR and the first client render,
  // then swap in the real grid once mounted to avoid a hydration mismatch.
  if (!mounted) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10">
        <div className="h-64 animate-pulse rounded-2xl bg-amber-900/5" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-amber-800 to-amber-600 text-amber-50 shadow-md shadow-amber-900/20">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Your habit tracker.
            </h1>
            <p className="text-sm text-amber-900/70">
              Small steps. A little more consistency.
            </p>
          </div>
        </div>

        {/* Month picker, matching the prev/next control used elsewhere. */}
        <div className="flex items-center gap-1 rounded-xl border border-amber-900/20 bg-white px-2 py-1.5 shadow-sm">
          <button
            type="button"
            onClick={() => goToMonth(-1)}
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
          <span className="min-w-36 text-center text-sm font-semibold text-zinc-900">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => goToMonth(1)}
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
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StatCard
          title="Daily habits"
          value={String(habits.length)}
          caption="Little commitments, every day"
          icon={
            <>
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="5" />
              <circle cx="12" cy="12" r="1" />
            </>
          }
        />
        <StatCard
          title="Check-ins"
          value={String(totalCheckins)}
          caption={monthLabel}
          icon={
            <>
              <circle cx="12" cy="12" r="9" />
              <polyline points="8 12 11 15 16 9" />
            </>
          }
        />
        <StatCard
          title="Month completed"
          value={`${monthPct}%`}
          caption={`${totalDone} of ${totalTarget} scheduled check-ins`}
          icon={
            <>
              <path d="M12 20V10" />
              <path d="M18 20V4" />
              <path d="M6 20v-4" />
            </>
          }
        />
      </div>

      {/* Monthly completion donut */}
      <div className="max-w-xl">
        <CompletionDonut
          segments={habits.map((h) => ({
            name: h.name,
            count: achievedCount(h),
            target: expectedCount(h),
            color: habitColor(h),
          }))}
          possibleCheckins={totalTarget}
          totalCheckins={totalDone}
          monthPct={monthPct}
          monthLabel={monthLabel}
        />
      </div>

      {/* Habit grid */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{monthLabel}</h2>
            <p className="text-sm text-amber-900/70">One day at a time.</p>
          </div>
          <button
            type="button"
            onClick={() => setModal({ mode: "add" })}
            className="flex items-center gap-2 self-start rounded-xl bg-linear-to-r from-amber-900 to-amber-700 px-4 py-2.5 text-sm font-semibold text-amber-50 shadow-md shadow-amber-900/20 transition-all hover:from-amber-800 hover:to-amber-600 sm:self-auto"
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
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add habit
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-amber-900/15 bg-white shadow-sm">
          {habits.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <p className="text-sm font-medium text-zinc-900">No habits yet.</p>
              <p className="text-sm text-amber-900/60">
                Add your first habit to start checking in.
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-amber-900/10 bg-amber-900/4">
                  <th className="sticky left-0 z-10 bg-amber-50 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-amber-900/60">
                    Habit
                  </th>
                  {days.map((day) => {
                    const weekday = new Date(year, month, day).getDay();
                    const isWeekend = weekday === 0 || weekday === 6;
                    const isToday = isoDate(year, month, day) === todayIso;
                    return (
                      <th
                        key={day}
                        className={`px-1.5 py-2 text-center font-semibold ${
                          isWeekend ? "bg-amber-900/4" : ""
                        }`}
                      >
                        <div
                          className={`mx-auto flex h-9 w-7 flex-col items-center justify-center rounded-md ${
                            isToday ? "bg-amber-900 text-amber-50" : ""
                          }`}
                        >
                          <span
                            className={`text-xs font-bold ${
                              isToday ? "text-amber-50" : "text-zinc-800"
                            }`}
                          >
                            {day}
                          </span>
                          <span
                            className={`text-[10px] ${
                              isToday ? "text-amber-100" : "text-amber-900/40"
                            }`}
                          >
                            {WEEKDAY_LETTER[weekday]}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-amber-900/60">
                    Progress
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-900/10">
                {habits.map((h) => {
                  const done = achievedCount(h);
                  const target = expectedCount(h);
                  const pct =
                    target > 0 ? Math.round((done / target) * 100) : 0;
                  const color = habitColor(h);
                  return (
                    <tr key={h.id} className="group hover:bg-amber-900/2">
                      <td className="sticky left-0 z-10 bg-white px-5 py-3 group-hover:bg-amber-50">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
                            aria-hidden="true"
                          />
                          <span className="font-medium text-zinc-900">
                            {h.name}
                          </span>
                        </div>
                        <span
                          className={`mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-medium ${chipClass(
                            h.category,
                          )}`}
                        >
                          {h.category}
                        </span>
                      </td>
                      {days.map((day) => {
                        const iso = isoDate(year, month, day);
                        const weekday = new Date(year, month, day).getDay();
                        const isWeekend = weekday === 0 || weekday === 6;
                        const checked = h.checkins.includes(iso);
                        const scheduled = isScheduledDay(h, weekday);
                        return (
                          <td
                            key={day}
                            className={`px-1.5 py-2 text-center ${
                              isWeekend ? "bg-amber-900/4" : ""
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleCheckin(h.id, iso)}
                              aria-label={`${h.name} on ${iso}`}
                              aria-pressed={checked}
                              style={checked ? { borderColor: color } : undefined}
                              className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all ${
                                checked
                                  ? "bg-white shadow-sm"
                                  : "border-amber-900/15 bg-white hover:border-amber-600/40 hover:bg-amber-900/5"
                              }${!scheduled && !checked ? " opacity-40" : ""}`}
                            >
                              {checked && (
                                <span
                                  className="h-3.5 w-3.5 rounded-full"
                                  style={{ backgroundColor: color }}
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-5 py-3 text-center">
                        <div className="font-semibold tabular-nums text-amber-800">
                          {done}/{target}
                        </div>
                        <div className="text-xs text-amber-900/50">{pct}%</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setModal({ mode: "edit", habit: h })}
                            aria-label={`Edit ${h.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/50 transition-colors hover:bg-amber-900/5 hover:text-amber-900"
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
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteHabit(h.id)}
                            aria-label={`Delete ${h.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-900/40 transition-colors hover:bg-amber-900/5 hover:text-red-600"
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
                              <path d="M3 6h18" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Leaderboards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-amber-900/15 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2.5">
            <svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-amber-700"
              aria-hidden="true"
            >
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
            <h2 className="text-lg font-semibold text-zinc-900">
              Top 3 most consistent
            </h2>
          </div>
          {topConsistent.length === 0 ? (
            <p className="text-sm text-amber-900/60">
              No check-ins yet this month.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-amber-900/10">
              {topConsistent.map((r, i) => (
                <LeaderRow
                  key={r.habit.id}
                  rank={i + 1}
                  name={r.habit.name}
                  color={habitColor(r.habit)}
                  count={r.done}
                  target={r.target}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-amber-900/15 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2.5">
            <svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-amber-700"
              aria-hidden="true"
            >
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
            <h2 className="text-lg font-semibold text-zinc-900">
              Needs improvement
            </h2>
          </div>
          {needsImprovement.length === 0 ? (
            <p className="text-sm text-amber-900/60">
              Nothing below 50% — nice work.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-amber-900/10">
              {needsImprovement.map((r, i) => (
                <LeaderRow
                  key={r.habit.id}
                  rank={i + 1}
                  name={r.habit.name}
                  color={habitColor(r.habit)}
                  count={r.done}
                  target={r.target}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {modal && (
        <HabitModal
          mode={modal.mode}
          initial={modal.mode === "edit" ? modal.habit : undefined}
          defaultColor={
            modal.mode === "edit"
              ? habitColor(modal.habit)
              : (HABIT_PALETTE.find(
                  (c) => !habits.some((h) => habitColor(h) === c),
                ) ?? HABIT_PALETTE[habits.length % HABIT_PALETTE.length])
          }
          categories={categoryOptions}
          onClose={() => setModal(null)}
          onSubmit={(name, category, color, frequency, weekdays) => {
            if (modal.mode === "edit") {
              editHabit(
                modal.habit.id,
                name,
                category,
                color,
                frequency,
                weekdays,
              );
            } else {
              addHabit(name, category, color, frequency, weekdays);
            }
            setModal(null);
          }}
        />
      )}
    </main>
  );
}

// A donut showing how much of the month's possible check-ins are done, split
// into one warm-toned slice per habit. Mirrors the spending overview donut: a
// background track plus overlapping slices so the ring reads as continuous.
function CompletionDonut({
  segments,
  possibleCheckins,
  totalCheckins,
  monthPct,
  monthLabel,
}: {
  segments: { name: string; count: number; target: number; color: string }[];
  possibleCheckins: number;
  totalCheckins: number;
  monthPct: number;
  monthLabel: string;
}) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="rounded-2xl border border-amber-900/15 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
            Monthly completion
          </h2>
          <p className="text-sm text-amber-900/70">
            Check-ins done in {monthLabel}
          </p>
        </div>
        <span className="text-amber-900/40">···</span>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-8">
        <div className="relative h-44 w-44 shrink-0">
          <svg
            viewBox="0 0 160 160"
            className="h-full w-full -rotate-90"
            aria-hidden="true"
          >
            {/* Background track: the full month's possible check-ins. */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="#f0e6d6"
              strokeWidth="14"
            />
            {possibleCheckins > 0 &&
              segments.map((s) => {
                const fraction = s.count / possibleCheckins;
                if (fraction <= 0) return null;
                // Small overlap so adjacent slices meet with no seam; the next
                // slice (drawn on top) covers it, keeping proportions correct.
                const dash = fraction * circumference + 0.75;
                const offset = -cumulative * circumference;
                cumulative += fraction;
                return (
                  <circle
                    key={s.name}
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="14"
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={offset}
                  />
                );
              })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-amber-900/70">Completed</span>
            <span className="text-xl font-semibold tabular-nums text-zinc-900">
              {monthPct}%
            </span>
          </div>
        </div>

        <ul className="flex-1 space-y-3 text-sm text-zinc-900">
          {segments.length === 0 ? (
            <li className="text-amber-900/60">No habits yet.</li>
          ) : totalCheckins === 0 ? (
            <li className="text-amber-900/60">No check-ins yet this month.</li>
          ) : (
            segments.map((s) => (
              <li key={s.name} className="flex items-center gap-3">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="font-semibold tabular-nums">
                  {s.target > 0 ? Math.round((s.count / s.target) * 100) : 0}%
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  caption,
  icon,
}: {
  title: string;
  value: string;
  caption: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-amber-900/15 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-sm text-amber-900/70">{title}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
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
            {icon}
          </svg>
        </span>
      </div>
      <p className="mt-2 text-4xl font-bold tracking-tight text-zinc-900">
        {value}
      </p>
      <p className="mt-3 text-sm text-amber-900/50">{caption}</p>
    </div>
  );
}

function LeaderRow({
  rank,
  name,
  color,
  count,
  target,
}: {
  rank: number;
  name: string;
  color: string;
  count: number;
  target: number;
}) {
  const pct = target > 0 ? Math.round((count / target) * 100) : 0;
  return (
    <li className="flex items-center gap-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-sm font-semibold text-amber-800">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span className="truncate font-medium text-zinc-900">{name}</span>
        </div>
        <div className="text-sm text-amber-900/50">
          {count} of {target} check-ins
        </div>
      </div>
      <span className="text-lg font-bold tabular-nums text-amber-800">
        {pct}%
      </span>
    </li>
  );
}

// Modal to add or edit a habit (name + category + colour).
function HabitModal({
  mode,
  initial,
  defaultColor,
  categories,
  onClose,
  onSubmit,
}: {
  mode: "add" | "edit";
  initial?: Habit;
  defaultColor: string;
  categories: string[];
  onClose: () => void;
  onSubmit: (
    name: string,
    category: string,
    color: string,
    frequency: HabitFrequency,
    weekdays: number[],
  ) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(
    initial?.category ?? categories[0] ?? "",
  );
  const [color, setColor] = useState(defaultColor);
  const [frequency, setFrequency] = useState<HabitFrequency>(
    initial?.frequency ?? "daily",
  );
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? []);
  const [options, setOptions] = useState(categories);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSubmit =
    name.trim() !== "" &&
    category.trim() !== "" &&
    (frequency !== "weekdays" || weekdays.length > 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(name, category, color, frequency, weekdays);
  }

  function toggleWeekday(idx: number) {
    setWeekdays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx],
    );
  }

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
        aria-label={mode === "edit" ? "Edit habit" : "Add habit"}
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-zinc-900">
              {mode === "edit" ? "Edit habit" : "Add habit"}
            </h3>
            <p className="mt-0.5 text-sm text-amber-900/60">
              A small daily commitment.
            </p>
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

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-900">Habit</span>
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Move my body"
                className={fieldClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-900">Category</span>
              <BudgetDropdown
                value={category}
                options={options}
                onChange={setCategory}
                onAddNew={(v) => {
                  setOptions((prev) =>
                    prev.includes(v) ? prev : [...prev, v],
                  );
                  setCategory(v);
                }}
                placeholder="Select a category"
                addLabel="Add new category…"
                ariaLabel="Category"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-900">
                Frequency
              </span>
              <div className="flex flex-wrap gap-2">
                {FREQUENCY_OPTIONS.map((opt) => {
                  const selected = frequency === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFrequency(opt.value)}
                      aria-pressed={selected}
                      className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
                        selected
                          ? "border-amber-700 bg-amber-900 text-amber-50"
                          : "border-amber-900/15 bg-amber-50/40 text-amber-900/80 hover:bg-amber-900/5"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {frequency === "weekdays" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {WEEKDAY_SHORT.map((label, idx) => {
                    const selected = weekdays.includes(idx);
                    return (
                      <button
                        key={label + idx}
                        type="button"
                        onClick={() => toggleWeekday(idx)}
                        aria-pressed={selected}
                        aria-label={label}
                        className={`h-10 w-10 rounded-full border text-xs font-semibold transition-colors ${
                          selected
                            ? "border-amber-700 bg-amber-900 text-amber-50"
                            : "border-amber-900/15 bg-amber-50/40 text-amber-900/70 hover:bg-amber-900/5"
                        }`}
                      >
                        {label.slice(0, 2)}
                      </button>
                    );
                  })}
                </div>
              )}
              {frequency === "weekdays" && weekdays.length === 0 && (
                <p className="text-xs text-red-600">Pick at least one day.</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-900">Colour</span>
              <div className="flex flex-wrap gap-2">
                {HABIT_PALETTE.map((c) => {
                  const selected = c === color;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      aria-label={`Use colour ${c}`}
                      aria-pressed={selected}
                      style={{ backgroundColor: c }}
                      className={`h-8 w-8 rounded-full transition-transform ${
                        selected
                          ? "ring-2 ring-zinc-900 ring-offset-2 scale-110"
                          : "hover:scale-110"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-amber-900 to-amber-700 px-4 py-3 text-sm font-semibold text-amber-50 shadow-md shadow-amber-900/20 transition-all hover:from-amber-800 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mode === "edit" ? "Save changes" : "Add habit"}
          </button>
        </form>
      </div>
    </div>
  );
}
