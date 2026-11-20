"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BudgetPlan, Expense } from "@/lib/types";
import {
  getBudgetTypeOptions,
  getIncome,
  saveBudgetPlan,
  saveBudgetTypeOptions,
  type BudgetTypeOption,
} from "@/lib/api";
import SpendingCharts, { type OverviewBucket } from "../spending-charts";
import BudgetDropdown from "../budget-dropdown";
import ConfirmDialog from "../confirm-dialog";

const currency = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

// Render a stored amount string as formatted currency, or an em dash when empty.
// Amounts are read-only in the table and edited through the row modal.
const displayAmount = (v?: string) =>
  v != null && v !== "" && !Number.isNaN(Number(v))
    ? currency.format(Number(v))
    : "—";

// Format a "YYYY-MM" month key for display, e.g. "October" or "October 2026".
function monthLabel(month: string, opts: Intl.DateTimeFormatOptions): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleString("en-US", opts);
}

// Shift a "YYYY-MM" month key by a number of months.
function addMonths(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Preset icons a user can attach to a variable-expense category. Each entry's
// `id` is stored on the type option; `paths` is the inner SVG of a 24×24,
// stroke-based (feather-style) icon. Keep this list in sync with CategoryIcon.
const CATEGORY_ICONS: { id: string; label: string; paths: React.ReactNode }[] = [
  {
    id: "cart",
    label: "Groceries",
    paths: (
      <>
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </>
    ),
  },
  {
    id: "food",
    label: "Dining",
    paths: (
      <>
        <path d="M8 2v7" />
        <path d="M5 2v7a3 3 0 0 0 6 0V2" />
        <path d="M8 9v13" />
        <path d="M17 2c-1.5 0-3 1.5-3 5v4h3" />
        <path d="M17 2v20" />
      </>
    ),
  },
  {
    id: "car",
    label: "Transport",
    paths: (
      <>
        <path d="M5 17h14" />
        <path d="M6 17l1.5-5h9L18 17" />
        <circle cx="7.5" cy="17.5" r="1.5" />
        <circle cx="16.5" cy="17.5" r="1.5" />
      </>
    ),
  },
  {
    id: "home",
    label: "Home",
    paths: (
      <>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </>
    ),
  },
  {
    id: "health",
    label: "Health",
    paths: (
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    ),
  },
  {
    id: "gift",
    label: "Gifts",
    paths: (
      <>
        <polyline points="20 12 20 22 4 22 4 12" />
        <rect x="2" y="7" width="20" height="5" />
        <line x1="12" y1="22" x2="12" y2="7" />
        <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
        <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
      </>
    ),
  },
  {
    id: "fun",
    label: "Entertainment",
    paths: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="17" x2="22" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
      </>
    ),
  },
  {
    id: "shopping",
    label: "Shopping",
    paths: (
      <>
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </>
    ),
  },
  {
    id: "coffee",
    label: "Coffee",
    paths: (
      <>
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" />
        <line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
      </>
    ),
  },
  {
    id: "travel",
    label: "Travel",
    paths: (
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
    ),
  },
  {
    id: "phone",
    label: "Phone",
    paths: (
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    ),
  },
  {
    id: "wifi",
    label: "Internet",
    paths: (
      <>
        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </>
    ),
  },
  {
    id: "book",
    label: "Education",
    paths: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </>
    ),
  },
  {
    id: "music",
    label: "Music",
    paths: (
      <>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </>
    ),
  },
  {
    id: "fitness",
    label: "Fitness",
    paths: (
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    ),
  },
  {
    id: "utilities",
    label: "Utilities",
    paths: (
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    ),
  },
  {
    id: "beauty",
    label: "Beauty",
    paths: (
      <>
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <line x1="20" y1="4" x2="8.12" y2="15.88" />
        <line x1="14.47" y1="14.48" x2="20" y2="20" />
        <line x1="8.12" y1="8.12" x2="12" y2="12" />
      </>
    ),
  },
  {
    id: "repairs",
    label: "Repairs",
    paths: (
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    ),
  },
  {
    id: "camera",
    label: "Photography",
    paths: (
      <>
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    paths: (
      <>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </>
    ),
  },
];

// Renders a preset category icon by id, or nothing when the id is unknown/empty.
function CategoryIcon({ id, size = 16 }: { id?: string; size?: number }) {
  const icon = CATEGORY_ICONS.find((i) => i.id === id);
  if (!icon) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon.paths}
    </svg>
  );
}


// Shared props for the small summary-card icons.
const cardIcon = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

// A single planned line item. `budget`/`soll` are the seed defaults; the amounts
// are editable and persisted. `due` is an optional Fälligkeitsdatum label.
type Row = {
  id: string;
  type: string;
  category: string;
  amount: string;
  due?: string;
};

// Section definitions. Every section shares the Category / Budget columns; those
// with `showDue` also render a Fälligkeitsdatum column, and `showType` (default
// on) controls the Type column.
type Section = {
  id: string;
  title: string;
  showDue: boolean;
  showType?: boolean;
  rows: Row[];
};

const FIXKOSTEN: Row[] = [];

// The only built-in sections. Fixkosten and Others live here; Variable Kosten is
// rendered separately but is also a default. Everything else is a table the user
// creates and names themselves, persisted per-account in the backend plan.
const SECTIONS: Section[] = [
  { id: "fix", title: "Fixkosten", showDue: true, rows: FIXKOSTEN },
  { id: "others", title: "Others", showDue: false, rows: [] },
];

// The built-in tables every user starts with. Fixkosten and Others live in
// SECTIONS above; Variable Kosten is rendered separately but is also a default.
// These three are the only non-removable tables; any other section is a
// user-created table saved to the backend.
const DEFAULT_SECTION_IDS = new Set(["fix", "others"]);

// Variable Kosten has its own Soll / Ist layout, kept separate from the
// Type / Category / Budget sections above.
const VARIABLE_KOSTEN: Row[] = [];

// User-created tables (sections). Persisted to the backend plan under a
// "table:<id>" key so they sync across devices (per month, like custom rows).
type CustomTable = {
  id: string;
  title: string;
  showDue: boolean;
  showType: boolean;
};

// Friendly titles for sections that used to ship as built-ins, so a returning
// account's existing data keeps a readable heading after those presets became
// ordinary user tables.
const LEGACY_TITLES: Record<string, string> = {
  investments: "Investments",
  savings: "Savings",
  sinking: "Sinking Funds",
  raten: "Ratenzahlungen",
  birthdays: "Birthdays",
};
const LEGACY_SHOW_DUE = new Set(["raten"]);

// Section ids that are never user tables: the defaults plus the synthetic ones.
const RESERVED_SECTION_IDS = new Set([
  ...DEFAULT_SECTION_IDS,
  "variable",
  "meta",
  "hidden",
]);

// Decode user tables from a backend plan. Tables are stored as "table:<id>"
// markers, but any other non-reserved section that carries data (e.g. a legacy
// preset like "savings") is surfaced as a table too, so existing data keeps a
// home and migrates into the user-table system on the next save.
function extractTables(plan: BudgetPlan): CustomTable[] {
  const tables: CustomTable[] = [];
  const seen = new Set<string>();
  for (const key of Object.keys(plan)) {
    if (!key.startsWith("table:")) continue;
    const id = key.slice("table:".length);
    const entry = plan[key];
    seen.add(id);
    tables.push({
      id,
      title: entry.category,
      showDue: entry.type === "due",
      // Tables saved before this flag existed have no marker -> keep the column.
      showType: entry.due !== "notype",
    });
  }
  for (const key of Object.keys(plan)) {
    const idx = key.indexOf(":");
    if (idx === -1) continue;
    const section = key.slice(0, idx);
    if (
      section === "table" ||
      section === "override" ||
      section === "hidden" ||
      RESERVED_SECTION_IDS.has(section) ||
      seen.has(section)
    )
      continue;
    seen.add(section);
    tables.push({
      id: section,
      title: LEGACY_TITLES[section] ?? section,
      showDue: LEGACY_SHOW_DUE.has(section),
      showType: true,
    });
  }
  return tables;
}

// Edits a user has made to a BUILT-IN section: a renamed title and/or toggled
// Type / Due columns. Persisted under an "override:<id>" plan key (like tables)
// so the change syncs across devices, per month.
type SectionOverride = { title: string; showDue: boolean; showType: boolean };

// Decode built-in section overrides from a backend plan's "override:<id>" markers.
function extractOverrides(plan: BudgetPlan): Record<string, SectionOverride> {
  const out: Record<string, SectionOverride> = {};
  for (const key of Object.keys(plan)) {
    if (!key.startsWith("override:")) continue;
    const id = key.slice("override:".length);
    const entry = plan[key];
    out[id] = {
      title: entry.category,
      showDue: entry.type === "due",
      showType: entry.due !== "notype",
    };
  }
  return out;
}

// Editable amounts keyed by section id then row id.
type Values = Record<string, Record<string, string>>;

function seedValues(): Values {
  const seed: Values = {};
  // Only the default sections are seeded, so a new account starts with just the
  // defaults. Existing accounts still load their other sections from the plan.
  for (const section of SECTIONS) {
    if (!DEFAULT_SECTION_IDS.has(section.id)) continue;
    seed[section.id] = Object.fromEntries(
      section.rows.map((r) => [r.id, r.amount]),
    );
  }
  seed.variable = Object.fromEntries(
    VARIABLE_KOSTEN.map((r) => [r.id, r.amount]),
  );
  // Monthly income, kept under a synthetic "meta" section so it persists with
  // the rest of the plan.
  seed.meta = { paycheck: "" };
  return seed;
}

const sumSection = (rows: Row[], amounts: Record<string, string> = {}) =>
  rows.reduce((total, r) => total + Number(amounts[r.id] || 0), 0);

// Custom (user-added) rows kept per section id. Built-in rows live in the
// hardcoded tables above; these are the ones the user adds at runtime.
type CustomRows = Record<string, Row[]>;

// Lookup of each built-in row's labels, keyed by section id then row id, plus a
// set of built-in row ids per section so we can tell custom rows apart.
const ROW_META: Record<string, Record<string, Row>> = {};
for (const section of SECTIONS) {
  ROW_META[section.id] = Object.fromEntries(section.rows.map((r) => [r.id, r]));
}
ROW_META.variable = Object.fromEntries(VARIABLE_KOSTEN.map((r) => [r.id, r]));

const BUILTIN_IDS: Record<string, Set<string>> = {};
for (const key of Object.keys(ROW_META)) {
  BUILTIN_IDS[key] = new Set(Object.keys(ROW_META[key]));
}

// Pull user-added rows out of a backend plan: any "section:row" whose row id
// isn't a built-in one (and isn't the meta/hidden section) is a custom row.
function extractCustom(plan: BudgetPlan): CustomRows {
  const custom: CustomRows = {};
  for (const key of Object.keys(plan)) {
    const idx = key.indexOf(":");
    if (idx === -1) continue;
    const section = key.slice(0, idx);
    const row = key.slice(idx + 1);
    if (
      section === "meta" ||
      section === "hidden" ||
      section === "table" ||
      section === "override"
    )
      continue;
    if (BUILTIN_IDS[section]?.has(row)) continue;
    const entry = plan[key];
    (custom[section] ??= []).push({
      id: row,
      type: entry.type,
      category: entry.category,
      amount: String(entry.amount),
      due: entry.due,
    });
  }
  return custom;
}

// Deleted built-in rows per section. Built-in rows come from the hardcoded
// tables, so to make their deletion stick across reloads we persist a marker
// keyed "hidden:<section>:<row>".
type Hidden = Record<string, Set<string>>;

function extractHidden(plan: BudgetPlan): Hidden {
  const hidden: Hidden = {};
  for (const key of Object.keys(plan)) {
    if (!key.startsWith("hidden:")) continue;
    const rest = key.slice("hidden:".length);
    const idx = rest.indexOf(":");
    if (idx === -1) continue;
    const section = rest.slice(0, idx);
    const row = rest.slice(idx + 1);
    (hidden[section] ??= new Set()).add(row);
  }
  return hidden;
}

// Flatten the editable values + custom rows into the backend's "section:row"
// map of entries. Built-in cells persist only when filled; custom rows always
// persist (so an added row survives before an amount is typed, and deletions
// drop out of the plan). Deleted built-in rows persist as "hidden:" markers.
// The paycheck lives under "meta:paycheck".
function flatten(
  values: Values,
  customRows: CustomRows,
  hidden: Hidden,
  customTables: CustomTable[],
  sectionOverrides: Record<string, SectionOverride>,
): BudgetPlan {
  const plan: BudgetPlan = {};
  for (const section of Object.keys(values)) {
    for (const row of Object.keys(values[section])) {
      // Custom rows are persisted below with their labels.
      if (section !== "meta" && !BUILTIN_IDS[section]?.has(row)) continue;
      if (hidden[section]?.has(row)) continue; // deleted built-in row
      const raw = values[section][row];
      if (raw === "" || raw == null) continue;
      const n = Number(raw);
      if (Number.isNaN(n)) continue;
      const meta = ROW_META[section]?.[row];
      plan[`${section}:${row}`] = {
        type: meta?.type ?? "",
        category: meta?.category ?? "",
        amount: n,
        due: meta?.due,
      };
    }
  }
  for (const section of Object.keys(customRows)) {
    for (const r of customRows[section]) {
      plan[`${section}:${r.id}`] = {
        type: r.type,
        category: r.category,
        amount: Number(values[section]?.[r.id] || 0),
        due: r.due,
      };
    }
  }
  for (const section of Object.keys(hidden)) {
    for (const row of hidden[section]) {
      plan[`hidden:${section}:${row}`] = { type: "", category: "", amount: 0 };
    }
  }
  // Persist each custom table's definition so it survives reloads even when empty.
  for (const t of customTables) {
    plan[`table:${t.id}`] = {
      type: t.showDue ? "due" : "",
      category: t.title,
      amount: 0,
      due: t.showType ? "" : "notype",
    };
  }
  // Persist edits to built-in sections (renamed title / toggled columns).
  for (const id of Object.keys(sectionOverrides)) {
    const o = sectionOverrides[id];
    plan[`override:${id}`] = {
      type: o.showDue ? "due" : "",
      category: o.title,
      amount: 0,
      due: o.showType ? "" : "notype",
    };
  }
  return plan;
}

// Apply a backend plan on top of the seed defaults, keyed by "section:row".
function mergePlan(seed: Values, plan: BudgetPlan): Values {
  const merged: Values = {};
  for (const key of Object.keys(seed)) merged[key] = { ...seed[key] };
  for (const key of Object.keys(plan)) {
    if (key.startsWith("hidden:")) continue;
    if (key.startsWith("table:")) continue;
    if (key.startsWith("override:")) continue;
    const idx = key.indexOf(":");
    if (idx === -1) continue;
    const section = key.slice(0, idx);
    const row = key.slice(idx + 1);
    if (!merged[section]) merged[section] = {};
    merged[section][row] = String(plan[key].amount);
  }
  return merged;
}

export default function BudgetSheet({
  month,
  expenses,
  initialPlan,
  initialOverview,
  initialError,
}: {
  month: string;
  expenses: Expense[];
  initialPlan: BudgetPlan;
  initialOverview: OverviewBucket[];
  initialError?: string;
}) {
  const router = useRouter();

  // Seed defaults merged with the plan loaded from the backend. Both the server
  // and the client start from the same props, so there's no hydration mismatch
  // and no flash of empty inputs. The component is remounted per month (keyed on
  // it in the page), so `month` is constant for this instance's lifetime.
  const [values, setValues] = useState<Values>(() =>
    mergePlan(seedValues(), initialPlan),
  );
  // User-added rows per section, reconstructed from the loaded plan.
  const [customRows, setCustomRows] = useState<CustomRows>(() =>
    extractCustom(initialPlan),
  );
  // Built-in rows the user has deleted, so they don't reappear from the seed.
  const [hidden, setHidden] = useState<Hidden>(() => extractHidden(initialPlan));
  // User-created tables (sections), reconstructed from the loaded plan.
  const [customTables, setCustomTables] = useState<CustomTable[]>(() =>
    extractTables(initialPlan),
  );
  // Edits to built-in sections (renamed title / toggled columns), per section id.
  const [sectionOverrides, setSectionOverrides] = useState<
    Record<string, SectionOverride>
  >(() => extractOverrides(initialPlan));

  // Personalizable Type choices, kept separately per table (section id). Each
  // section starts empty and is loaded from the backend, so choices persist per
  // account (not per browser) and new accounts start with none.
  const [typeOptions, setTypeOptions] = useState<
    Record<string, BudgetTypeOption[]>
  >({});
  const [typeOptionsLoaded, setTypeOptionsLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    getBudgetTypeOptions()
      .then((opts) => {
        if (active) setTypeOptions(opts);
      })
      .catch(() => {
        // Ignore load failures; the dropdowns still work from used types.
      })
      .finally(() => {
        if (active) setTypeOptionsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!typeOptionsLoaded) return;
    void saveBudgetTypeOptions(typeOptions).catch(() => {
      // Ignore save failures; the next change retries.
    });
  }, [typeOptions, typeOptionsLoaded]);

  function addTypeOption(sectionId: string, value: string) {
    const t = value.trim();
    if (!t) return;
    setTypeOptions((prev) => {
      const current = prev[sectionId] ?? [];
      if (current.some((o) => o.name.toLowerCase() === t.toLowerCase())) {
        return prev;
      }
      return {
        ...prev,
        [sectionId]: [...current, { name: t, icon: "" }].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      };
    });
  }

  // Rename a saved type option in a section, keeping its icon and updating any
  // custom rows that still reference the old name so the change is consistent.
  function renameTypeOption(
    sectionId: string,
    oldName: string,
    newName: string,
  ) {
    const next = newName.trim();
    if (!next || next === oldName) return;
    setTypeOptions((prev) => {
      const current = prev[sectionId] ?? [];
      if (
        current.some(
          (o) =>
            o.name.toLowerCase() === next.toLowerCase() &&
            o.name.toLowerCase() !== oldName.toLowerCase(),
        )
      ) {
        return prev; // target name already exists
      }
      return {
        ...prev,
        [sectionId]: current
          .map((o) => (o.name === oldName ? { ...o, name: next } : o))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    });
    setCustomRows((prev) => {
      const rows = prev[sectionId];
      if (!rows?.some((r) => r.type === oldName)) return prev;
      setEdited(true);
      return {
        ...prev,
        [sectionId]: rows.map((r) =>
          r.type === oldName ? { ...r, type: next } : r,
        ),
      };
    });
  }

  // Delete a saved type option and clear it from any custom rows that used it,
  // so it does not reappear via the "types in use" fallback.
  function deleteTypeOption(sectionId: string, name: string) {
    setTypeOptions((prev) => {
      const current = prev[sectionId] ?? [];
      return { ...prev, [sectionId]: current.filter((o) => o.name !== name) };
    });
    setCustomRows((prev) => {
      const rows = prev[sectionId];
      if (!rows?.some((r) => r.type === name)) return prev;
      setEdited(true);
      return {
        ...prev,
        [sectionId]: rows.map((r) =>
          r.type === name ? { ...r, type: "" } : r,
        ),
      };
    });
  }

  // Set (or clear) the preset icon on a saved type option. If the option is not
  // saved yet (e.g. a type only used on rows), add it so the icon persists.
  function setTypeIcon(sectionId: string, name: string, icon: string) {
    const n = name.trim();
    if (!n) return;
    setTypeOptions((prev) => {
      const current = prev[sectionId] ?? [];
      if (current.some((o) => o.name === n)) {
        return {
          ...prev,
          [sectionId]: current.map((o) =>
            o.name === n ? { ...o, icon } : o,
          ),
        };
      }
      return {
        ...prev,
        [sectionId]: [...current, { name: n, icon }].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      };
    });
  }

  // Type choices offered for a section's rows: every type the user added for this
  // table, plus any type already in use on its rows (built-in or custom). This
  // way a type added on one row is selectable in all rows of that same table.
  function typesFor(sectionId: string): string[] {
    const added = (typeOptions[sectionId] ?? []).map((o) => o.name);
    const used: string[] = [];
    const builtin =
      sectionId === "variable"
        ? VARIABLE_KOSTEN
        : (SECTIONS.find((s) => s.id === sectionId)?.rows ?? []);
    for (const r of builtin) {
      if (hidden[sectionId]?.has(r.id)) continue;
      if (r.type) used.push(r.type);
    }
    for (const r of customRows[sectionId] ?? []) {
      if (r.type) used.push(r.type);
    }
    return Array.from(new Set([...added, ...used])).sort((a, b) =>
      a.localeCompare(b),
    );
  }

  // The icon chosen for a type name within a section (empty when none).
  function iconFor(sectionId: string, name: string): string {
    return (
      (typeOptions[sectionId] ?? []).find((o) => o.name === name)?.icon ?? ""
    );
  }

  // Names the user explicitly added for a section (renamable / deletable).
  function editableTypesFor(sectionId: string): Set<string> {
    return new Set((typeOptions[sectionId] ?? []).map((o) => o.name));
  }

  // Category option pending deletion, confirmed via a modal (null = none).
  const [pendingDeleteType, setPendingDeleteType] = useState<{
    sectionId: string;
    name: string;
  } | null>(null);

  // Section id whose "Add row" modal is currently open (null = closed).
  const [modalSection, setModalSection] = useState<string | null>(null);
  // Row currently being edited via the modal (null = not editing).
  const [editing, setEditing] = useState<{
    sectionId: string;
    rowId: string;
    isBuiltin: boolean;
    initial: { type: string; category: string; amount: string; due: string };
  } | null>(null);
  // Add/rename-table modal state (null = closed).
  const [modalTable, setModalTable] = useState<
    | { mode: "add" }
    | { mode: "edit"; table: CustomTable }
    | {
        mode: "edit-builtin";
        id: string;
        current: { title: string; showDue: boolean; showType: boolean };
      }
    | null
  >(null);

  // Whether this month already had a saved plan (any real entry, ignoring the
  // meta/hidden bookkeeping keys). Used so the overview bar only reflects a month
  // the user has actually saved, not the seeded default template.
  const hasInitialData = Object.keys(initialPlan).some(
    (k) =>
      !k.startsWith("meta:") &&
      !k.startsWith("hidden:") &&
      !k.startsWith("table:") &&
      !k.startsWith("override:"),
  );
  // Flips true once the user edits anything this session, so the live bar shows
  // up as soon as they start entering amounts for a fresh month.
  const [edited, setEdited] = useState(false);

  // Monthly income (salary, side-jobs, etc.) is managed on the /income page and
  // summed here as the paycheck. Reload it whenever the month changes.
  const [incomeTotal, setIncomeTotal] = useState(0);
  useEffect(() => {
    let active = true;
    getIncome(month)
      .then((items) => {
        if (active)
          setIncomeTotal(items.reduce((sum, i) => sum + i.amount, 0));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [month]);

  // Debounced save: whenever the plan changes we wait briefly, then PUT the whole
  // month's plan to the backend, so rapid typing produces a single request. The
  // first render (initial load) is skipped so we don't immediately re-save.
  const firstRender = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveBudgetPlan(
        month,
        flatten(values, customRows, hidden, customTables, sectionOverrides),
      ).catch(() => {
        // Ignore transient save errors; the next edit retries.
      });
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [values, customRows, hidden, customTables, sectionOverrides, month]);

  // Switch months: flush the current month immediately (keepalive lets the PUT
  // finish after we navigate), then move to the new month's URL. The page
  // re-renders this component with that month's data loaded server-side. Only
  // flush when the month has real data or was edited, so merely browsing past
  // months never saves the seeded default template.
  function goToMonth(delta: number) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (hasInitialData || edited) {
      saveBudgetPlan(
        month,
        flatten(values, customRows, hidden, customTables, sectionOverrides),
      ).catch(() => {});
    }
    router.push(`/budget?month=${addMonths(month, delta)}`);
  }

  function setAmount(sectionId: string, rowId: string, value: string) {
    setEdited(true);
    setValues((prev) => ({
      ...prev,
      [sectionId]: { ...(prev[sectionId] ?? {}), [rowId]: value },
    }));
  }

  // Add a custom row to a section from the "Add row" modal. The user fills in
  // its labels/amount in the modal; every change is persisted.
  function addRow(
    sectionId: string,
    data: { type: string; category: string; amount: string; due: string },
  ) {
    setEdited(true);
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    setCustomRows((prev) => ({
      ...prev,
      [sectionId]: [
        ...(prev[sectionId] ?? []),
        {
          id,
          type: data.type,
          category: data.category,
          amount: data.amount,
          due: data.due,
        },
      ],
    }));
    setValues((prev) => ({
      ...prev,
      [sectionId]: { ...(prev[sectionId] ?? {}), [id]: data.amount },
    }));
    setModalSection(null);
  }

  // Remove a row. Custom rows are dropped entirely; built-in rows are marked
  // hidden so they stay deleted across reloads. Either way its amount is cleared.
  function deleteRow(sectionId: string, rowId: string) {
    setEdited(true);
    if (BUILTIN_IDS[sectionId]?.has(rowId)) {
      setHidden((prev) => {
        const next: Hidden = { ...prev, [sectionId]: new Set(prev[sectionId]) };
        next[sectionId].add(rowId);
        return next;
      });
    } else {
      setCustomRows((prev) => ({
        ...prev,
        [sectionId]: (prev[sectionId] ?? []).filter((r) => r.id !== rowId),
      }));
    }
    setValues((prev) => {
      const next = { ...prev, [sectionId]: { ...(prev[sectionId] ?? {}) } };
      delete next[sectionId][rowId];
      return next;
    });
  }

  // Edit a custom row's labels (type / category / due).
  function editRow(sectionId: string, rowId: string, patch: Partial<Row>) {
    setEdited(true);
    setCustomRows((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] ?? []).map((r) =>
        r.id === rowId ? { ...r, ...patch } : r,
      ),
    }));
  }

  // Open the modal pre-filled with a row's current values for editing.
  function startEdit(
    sectionId: string,
    row: Row,
    isBuiltin: boolean,
    amount: string,
  ) {
    setEditing({
      sectionId,
      rowId: row.id,
      isBuiltin,
      initial: {
        type: row.type,
        category: row.category,
        amount,
        due: row.due ?? "",
      },
    });
  }

  // Apply changes from the edit modal. Custom rows are updated in place. For a
  // built-in row, changing only the amount updates it directly; changing a label
  // converts it into a custom row (the original is hidden) so the edit persists.
  function saveEdit(data: {
    type: string;
    category: string;
    amount: string;
    due: string;
  }) {
    if (!editing) return;
    const { sectionId, rowId, isBuiltin } = editing;
    setEdited(true);
    if (isBuiltin) {
      const meta = ROW_META[sectionId]?.[rowId];
      const labelsChanged =
        !meta ||
        data.type !== (meta.type ?? "") ||
        data.category !== (meta.category ?? "") ||
        (data.due ?? "") !== (meta.due ?? "");
      if (labelsChanged) {
        const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
        setHidden((prev) => {
          const next: Hidden = {
            ...prev,
            [sectionId]: new Set(prev[sectionId]),
          };
          next[sectionId].add(rowId);
          return next;
        });
        setCustomRows((prev) => ({
          ...prev,
          [sectionId]: [
            ...(prev[sectionId] ?? []),
            {
              id,
              type: data.type,
              category: data.category,
              amount: data.amount,
              due: data.due,
            },
          ],
        }));
        setValues((prev) => {
          const next = { ...prev, [sectionId]: { ...(prev[sectionId] ?? {}) } };
          delete next[sectionId][rowId];
          next[sectionId][id] = data.amount;
          return next;
        });
      } else {
        setAmount(sectionId, rowId, data.amount);
      }
    } else {
      editRow(sectionId, rowId, {
        type: data.type,
        category: data.category,
        due: data.due,
      });
      setAmount(sectionId, rowId, data.amount);
    }
    setEditing(null);
  }

  // Create a new user table from the add-table modal.
  function addTable(data: {
    title: string;
    showDue: boolean;
    showType: boolean;
  }) {
    setEdited(true);
    const id = `table-${crypto.randomUUID().slice(0, 8)}`;
    setCustomTables((prev) => [
      ...prev,
      {
        id,
        title: data.title.trim() || "Untitled",
        showDue: data.showDue,
        showType: data.showType,
      },
    ]);
    setModalTable(null);
  }

  // Delete a custom table and everything tied to it.
  function deleteTable(id: string) {
    setEdited(true);
    setCustomTables((prev) => prev.filter((t) => t.id !== id));
    setCustomRows((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setValues((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setTypeOptions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // Rename / toggle columns on a user table via the edit-table modal.
  function saveTable(
    id: string,
    data: { title: string; showDue: boolean; showType: boolean },
  ) {
    setEdited(true);
    setCustomTables((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              title: data.title.trim() || t.title,
              showDue: data.showDue,
              showType: data.showType,
            }
          : t,
      ),
    );
    setModalTable(null);
  }

  // Rename / toggle columns on a BUILT-IN section via the same edit-table modal.
  // The change is stored as an override and persisted under "override:<id>".
  function saveSectionOverride(
    id: string,
    data: { title: string; showDue: boolean; showType: boolean },
  ) {
    setEdited(true);
    setSectionOverrides((prev) => ({
      ...prev,
      [id]: {
        title: data.title.trim() || prev[id]?.title || id,
        showDue: data.showDue,
        showType: data.showType,
      },
    }));
    setModalTable(null);
  }

  // A built-in section with the user's override (if any) applied.
  function effectiveSection(base: Section): Section {
    const o = sectionOverrides[base.id];
    if (!o) return base;
    return {
      ...base,
      title: o.title,
      showDue: o.showDue,
      showType: o.showType,
    };
  }

  // Open the edit-table modal for a built-in section, pre-filled with its
  // effective title and column settings.
  function editBuiltin(base: Section) {
    const eff = effectiveSection(base);
    setModalTable({
      mode: "edit-builtin",
      id: base.id,
      current: {
        title: eff.title,
        showDue: eff.showDue,
        showType: eff.showType !== false,
      },
    });
  }

  // Shared modal config (labels/options) for a section, used by both the add and
  // edit modals.
  function sectionConfig(sectionId: string) {
    if (sectionId === "variable") {
      return {
        title: "Variable Kosten",
        amountLabel: "Soll (€)",
        showDue: false,
        showType: true,
      };
    }
    const s = SECTIONS.find((x) => x.id === sectionId);
    if (s) {
      const o = sectionOverrides[sectionId];
      return {
        title: o?.title ?? s.title,
        amountLabel: "Budget (€)",
        showDue: o?.showDue ?? s.showDue,
        showType: o ? o.showType : s.showType !== false,
      };
    }
    const t = customTables.find((x) => x.id === sectionId);
    return {
      title: t?.title ?? "Row",
      amountLabel: "Budget (€)",
      showDue: t?.showDue ?? false,
      showType: t?.showType !== false,
    };
  }

  // Total of a section's visible built-in rows plus any custom rows.
  const sectionTotal = (sectionId: string, builtinRows: Row[]) =>
    builtinRows.reduce(
      (total, r) =>
        hidden[sectionId]?.has(r.id)
          ? total
          : total + Number(values[sectionId]?.[r.id] || 0),
      0,
    ) +
    (customRows[sectionId] ?? []).reduce(
      (total, r) => total + Number(values[sectionId]?.[r.id] || 0),
      0,
    );

  const variableTotal = sectionTotal("variable", VARIABLE_KOSTEN);

  // Overall expenses = every section plus the variable costs. Rest is whatever
  // is left of the paycheck after all planned costs.
  const overallExpenses =
    SECTIONS.reduce((total, s) => total + sectionTotal(s.id, s.rows), 0) +
    customTables.reduce((total, t) => total + sectionTotal(t.id, []), 0) +
    variableTotal;
  const paycheck = incomeTotal;
  const rest = paycheck - overallExpenses;

  // Breakdown for the "Where it went" donut: one slice per budget section.
  const whereItWent = [
    { category: "Fixkosten", amount: sectionTotal("fix", FIXKOSTEN) },
    { category: "Variable Kosten", amount: variableTotal },
    { category: "Others", amount: sectionTotal("others", []) },
    ...customTables.map((t) => ({
      category: t.title,
      amount: sectionTotal(t.id, []),
    })),
  ];

  // Six-month overall-expenses bar chart. The last bucket is the selected month;
  // override it with the live total only when the month has saved data or the
  // user is editing it, so months never saved stay empty (no bar).
  const overview = initialOverview.map((bucket, i) =>
    i === initialOverview.length - 1 && (hasInitialData || edited)
      ? { ...bucket, total: overallExpenses }
      : bucket,
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10 lg:flex-row">
      <div className="min-w-0 flex-1">
        <header className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900">
              Your {monthLabel(month, { month: "long" })} budget sheet.
            </h1>
            <p className="mt-2 text-base text-amber-900/70">
              A clearer picture of where your money goes.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Month picker: moves between months, saving the current one first. */}
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
              <span className="min-w-32 text-center text-sm font-semibold text-zinc-900">
                {monthLabel(month, { month: "long", year: "numeric" })}
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
          </div>
        </header>

        {initialError && (
          <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {initialError}
          </div>
        )}

        {/* Summary: overall planned expenses, the paycheck, and what's left. */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <span className="text-sm text-amber-900/70">Overall expenses</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <svg {...cardIcon} aria-hidden="true">
                  <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
                  <path d="M21 12a2 2 0 0 0-2-2h-4a2 2 0 0 0 0 4h4a2 2 0 0 0 2-2Z" />
                </svg>
              </span>
            </div>
            <div className="mt-4 text-4xl font-semibold tracking-tight tabular-nums text-zinc-900">
              {currency.format(overallExpenses)}
            </div>
            <p className="mt-4 text-sm text-amber-900/60">
              Sum of all sheet sections
            </p>
          </div>

          <Link
            href="/income"
            className="group block rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm transition-colors hover:border-amber-700/40 hover:bg-amber-900/5"
          >
            <div className="flex items-start justify-between">
              <span className="text-sm text-amber-900/70">Paycheck</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <svg {...cardIcon} aria-hidden="true">
                  <line x1="17" y1="7" x2="7" y2="17" />
                  <polyline points="17 17 7 17 7 7" />
                </svg>
              </span>
            </div>
            <div className="mt-4 text-4xl font-semibold tracking-tight tabular-nums text-zinc-900">
              {currency.format(paycheck)}
            </div>
            <p className="mt-4 flex items-center gap-1 text-sm text-amber-900/60">
              Monthly income
              <span className="font-medium text-amber-800 underline-offset-2 group-hover:underline">
                · manage sources →
              </span>
            </p>
          </Link>

          <div className="rounded-xl border border-amber-900/20 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <span className="text-sm text-amber-900/70">Rest</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <svg {...cardIcon} aria-hidden="true">
                  <line x1="7" y1="17" x2="17" y2="7" />
                  <polyline points="7 7 17 7 17 17" />
                </svg>
              </span>
            </div>
            <div
              className={`mt-4 text-4xl font-semibold tracking-tight tabular-nums ${
                rest < 0 ? "text-red-700" : "text-zinc-900"
              }`}
            >
              {currency.format(rest)}
            </div>
            <p
              className={`mt-4 flex items-center gap-1.5 text-sm ${
                rest < 0 ? "text-red-700" : "text-emerald-700"
              }`}
            >
              {rest >= 0 ? (
                <svg {...cardIcon} className="h-4 w-4" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : null}
              {rest >= 0
                ? "Left after all planned costs"
                : "Over your paycheck"}
            </p>
          </div>
        </div>

        {/* Fixkosten first, then Variable Kosten, then the remaining sections. */}
        <CostSection
          section={effectiveSection(SECTIONS[0])}
          amounts={values[SECTIONS[0].id] ?? {}}
          custom={customRows[SECTIONS[0].id] ?? []}
          hidden={hidden[SECTIONS[0].id]}
          typeOptions={typesFor(SECTIONS[0].id)}
          onAddRow={setModalSection}
          onDeleteRow={deleteRow}
          onEditRow={editRow}
          onStartEdit={startEdit}
          onAddType={(v) => addTypeOption(SECTIONS[0].id, v)}
          onEditTable={() => editBuiltin(SECTIONS[0])}
        />

        <VariableSection
          rows={VARIABLE_KOSTEN}
          amounts={values.variable ?? {}}
          custom={customRows.variable ?? []}
          hidden={hidden.variable}
          total={variableTotal}
          iconFor={(name) => iconFor("variable", name)}
          editableTypes={editableTypesFor("variable")}
          onRenameType={(oldName, newName) =>
            renameTypeOption("variable", oldName, newName)
          }
          onDeleteType={(name) =>
            setPendingDeleteType({ sectionId: "variable", name })
          }
          onAddRow={() => setModalSection("variable")}
          onDeleteRow={(rowId) => deleteRow("variable", rowId)}
          onEditRow={(rowId, patch) => editRow("variable", rowId, patch)}
          onStartEdit={(row, isBuiltin, amount) =>
            startEdit("variable", row, isBuiltin, amount)
          }
          onAddType={(v) => addTypeOption("variable", v)}
        />

        {SECTIONS.slice(1).map((section) => (
          <CostSection
            key={section.id}
            section={effectiveSection(section)}
            amounts={values[section.id] ?? {}}
            custom={customRows[section.id] ?? []}
            hidden={hidden[section.id]}
            typeOptions={typesFor(section.id)}
            onAddRow={setModalSection}
            onDeleteRow={deleteRow}
            onEditRow={editRow}
            onStartEdit={startEdit}
            onAddType={(v) => addTypeOption(section.id, v)}
            onEditTable={() => editBuiltin(section)}
          />
        ))}

        {/* User-created tables, each rendered like a built-in cost section. */}
        {customTables.map((t) => (
          <CostSection
            key={t.id}
            section={{
              id: t.id,
              title: t.title,
              showDue: t.showDue,
              showType: t.showType,
              rows: [],
            }}
            amounts={values[t.id] ?? {}}
            custom={customRows[t.id] ?? []}
            hidden={hidden[t.id]}
            typeOptions={typesFor(t.id)}
            onAddRow={setModalSection}
            onDeleteRow={deleteRow}
            onEditRow={editRow}
            onStartEdit={startEdit}
            onAddType={(v) => addTypeOption(t.id, v)}
            onEditTable={() => setModalTable({ mode: "edit", table: t })}
            onDeleteTable={() => deleteTable(t.id)}
          />
        ))}

        {/* Add a brand-new personalizable table. */}
        <button
          type="button"
          onClick={() => setModalTable({ mode: "add" })}
          className="mb-8 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-900/20 bg-white/60 px-4 py-4 text-sm font-semibold text-amber-900 transition-colors hover:border-amber-600/50 hover:bg-amber-900/5"
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
          Add table
        </button>
      </div>

      <div className="w-full shrink-0 lg:w-[380px]">
        <SpendingCharts
          expenses={expenses}
          whereItWent={whereItWent}
          overview={overview}
        />
      </div>

      {modalSection &&
        (() => {
          const cfg = sectionConfig(modalSection);
          return (
            <RowModal
              title="Add row"
              submitLabel="Add row"
              sectionTitle={cfg.title}
              amountLabel={cfg.amountLabel}
              showDue={cfg.showDue}
              showType={cfg.showType}
              typeOptions={typesFor(modalSection)}
              onAddType={(t) => addTypeOption(modalSection, t)}
              editableTypes={editableTypesFor(modalSection)}
              onRenameType={(oldName, newName) =>
                renameTypeOption(modalSection, oldName, newName)
              }
              onDeleteType={(name) =>
                setPendingDeleteType({ sectionId: modalSection, name })
              }
              showIcons={modalSection === "variable"}
              iconForName={(name) => iconFor(modalSection, name)}
              onSetTypeIcon={(name, icon) =>
                setTypeIcon(modalSection, name, icon)
              }
              onClose={() => setModalSection(null)}
              onSubmit={(data) => addRow(modalSection, data)}
            />
          );
        })()}

      {editing &&
        (() => {
          const cfg = sectionConfig(editing.sectionId);
          return (
            <RowModal
              title="Edit row"
              submitLabel="Save changes"
              sectionTitle={cfg.title}
              amountLabel={cfg.amountLabel}
              showDue={cfg.showDue}
              showType={cfg.showType}
              typeOptions={typesFor(editing.sectionId)}
              onAddType={(t) => addTypeOption(editing.sectionId, t)}
              editableTypes={editableTypesFor(editing.sectionId)}
              onRenameType={(oldName, newName) =>
                renameTypeOption(editing.sectionId, oldName, newName)
              }
              onDeleteType={(name) =>
                setPendingDeleteType({ sectionId: editing.sectionId, name })
              }
              showIcons={editing.sectionId === "variable"}
              iconForName={(name) => iconFor(editing.sectionId, name)}
              onSetTypeIcon={(name, icon) =>
                setTypeIcon(editing.sectionId, name, icon)
              }
              initial={editing.initial}
              onClose={() => setEditing(null)}
              onSubmit={saveEdit}
            />
          );
        })()}

      {modalTable && (
        <TableModal
          mode={modalTable.mode === "add" ? "add" : "edit"}
          initial={
            modalTable.mode === "edit"
              ? modalTable.table
              : modalTable.mode === "edit-builtin"
                ? {
                    id: modalTable.id,
                    title: modalTable.current.title,
                    showDue: modalTable.current.showDue,
                    showType: modalTable.current.showType,
                  }
                : undefined
          }
          onClose={() => setModalTable(null)}
          onSubmit={(data) =>
            modalTable.mode === "edit"
              ? saveTable(modalTable.table.id, data)
              : modalTable.mode === "edit-builtin"
                ? saveSectionOverride(modalTable.id, data)
                : addTable(data)
          }
        />
      )}

      <ConfirmDialog
        open={pendingDeleteType !== null}
        title="Delete category?"
        message={
          pendingDeleteType
            ? `"${pendingDeleteType.name}" will be removed from the list and cleared from any rows using it.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDeleteType) {
            deleteTypeOption(pendingDeleteType.sectionId, pendingDeleteType.name);
          }
          setPendingDeleteType(null);
        }}
        onCancel={() => setPendingDeleteType(null)}
      />
    </main>
  );
}

// Three-dots (kebab) menu for table-level actions (edit / delete). Opens a small
// popover and closes on outside click or after an action is chosen.
function TableMenu({
  title,
  onEdit,
  onDelete,
}: {
  title: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Options for ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Options"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-amber-900/70 transition-all hover:bg-amber-900/5 hover:text-amber-900 ${
          open ? "bg-amber-900/10 text-amber-900" : ""
        }`}
      >
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="12" cy="19" r="1.7" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="animate-menu-pop absolute right-0 top-11 z-20 w-48 origin-top-right overflow-hidden rounded-2xl border border-amber-900/10 bg-white/95 p-1.5 shadow-xl shadow-amber-950/10 ring-1 ring-black/5 backdrop-blur-sm"
        >
          {onEdit && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
              className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-amber-900/5"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100/70 text-amber-800 transition-colors group-hover:bg-amber-900/10">
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </span>
              Edit table
            </button>
          )}
          {onEdit && onDelete && (
            <div className="my-1 h-px bg-amber-900/10" />
          )}
          {onDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100/70 text-red-600 transition-colors group-hover:bg-red-200/80">
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </span>
              Delete table
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Reusable section for the Type / Category / Budget (+ optional due date) tables.
function CostSection({
  section,
  amounts,
  custom,
  hidden,
  typeOptions,
  onAddRow,
  onDeleteRow,
  onEditRow,
  onStartEdit,
  onAddType,
  onEditTable,
  onDeleteTable,
}: {
  section: Section;
  amounts: Record<string, string>;
  custom: Row[];
  hidden?: Set<string>;
  typeOptions: string[];
  onAddRow: (sectionId: string) => void;
  onDeleteRow: (sectionId: string, rowId: string) => void;
  onEditRow: (sectionId: string, rowId: string, patch: Partial<Row>) => void;
  onStartEdit: (
    sectionId: string,
    row: Row,
    isBuiltin: boolean,
    amount: string,
  ) => void;
  onAddType: (value: string) => void;
  onEditTable?: () => void;
  onDeleteTable?: () => void;
}) {
  const builtinRows = section.rows.filter((r) => !hidden?.has(r.id));
  const total =
    sumSection(builtinRows, amounts) +
    custom.reduce((t, r) => t + Number(amounts[r.id] || 0), 0);
  const itemCount = builtinRows.length + custom.length;
  const showType = section.showType !== false;
  // Category + Budget, plus optional Type/Due columns, plus the actions column.
  const colCount = 2 + (showType ? 1 : 0) + (section.showDue ? 1 : 0) + 1;

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-amber-900/20 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            {section.title}
          </h2>
          <p className="text-sm text-amber-900/60">{itemCount} items</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-2xl font-semibold tabular-nums text-zinc-900">
            {currency.format(total)}
          </div>
          {(onEditTable || onDeleteTable) && (
            <TableMenu
              title={section.title}
              onEdit={onEditTable}
              onDelete={onDeleteTable}
            />
          )}
        </div>
      </div>

      <table className="w-full table-fixed text-sm text-zinc-900">
        <colgroup>
          {showType && <col />}
          <col />
          <col className="w-32" />
          {section.showDue && <col className="w-36" />}
          <col className="w-24" />
        </colgroup>
        <thead>
          <tr className="bg-[#f1e8d9] text-xs font-bold uppercase tracking-wide text-amber-900">
            {showType && <th className="px-5 py-2 text-left">Type</th>}
            <th className="px-3 py-2 text-left">Category</th>
            <th className="px-3 py-2 text-center">Budget</th>
            {section.showDue && (
              <th className="px-5 py-2 text-left">Fälligkeitsdatum</th>
            )}
            <th className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-900/10">
          {itemCount === 0 ? (
            <tr>
              <td
                colSpan={colCount}
                className="px-5 py-10 text-center text-amber-900/50"
              >
                No items yet.
              </td>
            </tr>
          ) : (
            <>
              {builtinRows.map((r) => (
                <tr key={r.id} className="group hover:bg-amber-900/5">
                  {showType && (
                    <td className="px-5 py-2 text-amber-900/70">{r.type}</td>
                  )}
                  <td className="px-3 py-2 font-medium">{r.category}</td>
                  <td className="px-3 py-2 text-center font-semibold tabular-nums text-zinc-900">
                    {displayAmount(amounts[r.id])}
                  </td>
                  {section.showDue && (
                    <td className="px-5 py-2 text-amber-900/70 tabular-nums">
                      {r.due || "—"}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    <RowActions
                      onEdit={() =>
                        onStartEdit(section.id, r, true, amounts[r.id] ?? "")
                      }
                      onDelete={() => onDeleteRow(section.id, r.id)}
                      label={r.category || "row"}
                    />
                  </td>
                </tr>
              ))}
              {custom.map((r) => (
                <tr key={r.id} className="group hover:bg-amber-900/5">
                  {showType && (
                    <td className="px-5 py-2 text-amber-900/70">{r.type}</td>
                  )}
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={r.category}
                      onChange={(e) =>
                        onEditRow(section.id, r.id, { category: e.target.value })
                      }
                      placeholder="Category"
                      aria-label="Category"
                      className="w-full rounded-md bg-transparent px-2 py-1 text-sm font-medium text-zinc-900 hover:bg-amber-900/5 focus:bg-amber-50 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-center font-semibold tabular-nums text-zinc-900">
                    {displayAmount(amounts[r.id])}
                  </td>
                  {section.showDue && (
                    <td className="px-5 py-2">
                      <input
                        type="text"
                        placeholder="dd/mm/yyyy"
                        value={r.due ?? ""}
                        onChange={(e) =>
                          onEditRow(section.id, r.id, { due: e.target.value })
                        }
                        className="w-32 rounded-md bg-transparent px-2 py-1 text-sm text-amber-900/70 tabular-nums hover:bg-amber-900/5 focus:bg-amber-50 focus:outline-none"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    <RowActions
                      onEdit={() =>
                        onStartEdit(section.id, r, false, amounts[r.id] ?? "")
                      }
                      onDelete={() => onDeleteRow(section.id, r.id)}
                      label={r.category || "row"}
                    />
                  </td>
                </tr>
              ))}
            </>
          )}
          <AddRow colSpan={colCount} onClick={() => onAddRow(section.id)} />
        </tbody>
        <tfoot>
          <tr className="border-t border-amber-900/10 bg-amber-50">
            <td
              className="px-5 py-3 font-semibold text-zinc-900"
              colSpan={showType ? 2 : 1}
            >
              Total {section.title}
            </td>
            <td className="px-3 py-3 text-center font-semibold tabular-nums text-emerald-700">
              {currency.format(total)}
            </td>
            {section.showDue && <td />}
            <td />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

// Variable Kosten with its distinct Soll / Ist columns.
function VariableSection({
  rows,
  amounts,
  custom,
  hidden,
  total,
  iconFor,
  editableTypes,
  onRenameType,
  onDeleteType,
  onAddRow,
  onDeleteRow,
  onEditRow,
  onStartEdit,
  onAddType,
}: {
  rows: Row[];
  amounts: Record<string, string>;
  custom: Row[];
  hidden?: Set<string>;
  total: number;
  iconFor: (name: string) => string;
  editableTypes: Set<string>;
  onRenameType: (oldName: string, newName: string) => void;
  onDeleteType: (name: string) => void;
  onAddRow: () => void;
  onDeleteRow: (rowId: string) => void;
  onEditRow: (rowId: string, patch: Partial<Row>) => void;
  onStartEdit: (row: Row, isBuiltin: boolean, amount: string) => void;
  onAddType: (value: string) => void;
}) {
  const builtinRows = rows.filter((r) => !hidden?.has(r.id));
  const itemCount = builtinRows.length + custom.length;

  // Which row's Type label is being renamed inline (null = none) and its draft.
  const [editingTypeRow, setEditingTypeRow] = useState<string | null>(null);
  const [draftType, setDraftType] = useState("");

  function commitRename(original: string) {
    const next = draftType.trim();
    if (next && next !== original) onRenameType(original, next);
    setEditingTypeRow(null);
  }

  // Type cell: the chosen preset icon (if any) plus the type label. Hovering a
  // user-added category reveals inline rename (pencil) and delete (trash)
  // actions, mirroring the dropdown in the add/edit modal.
  const typeCell = (row: Row) => {
    const type = row.type;
    if (editingTypeRow === row.id) {
      return (
        <input
          type="text"
          value={draftType}
          autoFocus
          onChange={(e) => setDraftType(e.target.value)}
          onBlur={() => commitRename(type)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename(type);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditingTypeRow(null);
            }
          }}
          aria-label="Rename category"
          className="w-full rounded-md border border-amber-600 bg-amber-50 px-2 py-1 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
        />
      );
    }
    const canModify = Boolean(type) && editableTypes.has(type);
    return (
      <span className="inline-flex items-center gap-1.5">
        {iconFor(type) && (
          <span className="text-amber-700">
            <CategoryIcon id={iconFor(type)} />
          </span>
        )}
        {type}
        {canModify && (
          <span className="ml-1 inline-flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              aria-label={`Rename ${type}`}
              onClick={() => {
                setDraftType(type);
                setEditingTypeRow(row.id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-amber-900/60 transition-colors hover:bg-amber-900/10 hover:text-amber-900"
            >
              <svg
                width={13}
                height={13}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={`Delete ${type}`}
              onClick={() => onDeleteType(type)}
              className="flex h-6 w-6 items-center justify-center rounded text-amber-900/60 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <svg
                width={13}
                height={13}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </span>
        )}
      </span>
    );
  };

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-amber-900/20 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Variable Kosten</h2>
          <p className="text-sm text-amber-900/60">{itemCount} items</p>
        </div>
        <div className="text-2xl font-semibold tabular-nums text-zinc-900">
          {currency.format(total)}
        </div>
      </div>

      <table className="w-full table-fixed text-sm text-zinc-900">
        <colgroup>
          <col />
          <col />
          <col className="w-32" />
          <col className="w-20" />
          <col className="w-24" />
        </colgroup>
        <thead>
          <tr className="bg-[#f1e8d9] text-xs font-bold uppercase tracking-wide text-amber-900">
            <th className="px-5 py-2 text-left">Type</th>
            <th className="px-3 py-2 text-left">Category</th>
            <th className="px-3 py-2 text-center">Soll</th>
            <th className="px-5 py-2 text-center">Ist</th>
            <th className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-900/10">
          {builtinRows.map((r) => (
            <tr key={r.id} className="group hover:bg-amber-900/5">
              <td className="px-5 py-2 text-amber-900/70">{typeCell(r)}</td>
              <td className="px-3 py-2 font-medium">{r.category}</td>
              <td className="px-3 py-2 text-center font-semibold tabular-nums text-zinc-900">
                {displayAmount(amounts[r.id])}
              </td>
              <td className="px-5 py-2 text-center text-amber-900/50">—</td>
              <td className="px-3 py-2 text-right">
                <RowActions
                  onEdit={() => onStartEdit(r, true, amounts[r.id] ?? "")}
                  onDelete={() => onDeleteRow(r.id)}
                  label={r.category || "row"}
                />
              </td>
            </tr>
          ))}
          {custom.map((r) => (
            <tr key={r.id} className="group hover:bg-amber-900/5">
              <td className="px-5 py-2 text-amber-900/70">{typeCell(r)}</td>
              <td className="px-3 py-2">
                <input
                  type="text"
                  value={r.category}
                  onChange={(e) => onEditRow(r.id, { category: e.target.value })}
                  placeholder="Category"
                  aria-label="Category"
                  className="w-full rounded-md bg-transparent px-2 py-1 text-sm font-medium text-zinc-900 hover:bg-amber-900/5 focus:bg-amber-50 focus:outline-none"
                />
              </td>
              <td className="px-3 py-2 text-center font-semibold tabular-nums text-zinc-900">
                {displayAmount(amounts[r.id])}
              </td>
              <td className="px-5 py-2 text-center text-amber-900/50">—</td>
              <td className="px-3 py-2 text-right">
                <RowActions
                  onEdit={() => onStartEdit(r, false, amounts[r.id] ?? "")}
                  onDelete={() => onDeleteRow(r.id)}
                  label={r.category || "row"}
                />
              </td>
            </tr>
          ))}
          <AddRow colSpan={5} onClick={onAddRow} />
        </tbody>
        <tfoot>
          <tr className="border-t border-amber-900/10 bg-amber-50">
            <td className="px-5 py-3 font-semibold text-zinc-900" colSpan={2}>
              Total Variable Kosten
            </td>
            <td className="px-3 py-3 text-center font-semibold tabular-nums text-emerald-700">
              {currency.format(total)}
            </td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

// Modal dialog for adding or editing a row. Type and Category use the modern
// BudgetDropdown with per-table personalizable choices and an inline
// "+ Add new…" action. The due-date field only shows for sections that track a
// Fälligkeitsdatum. Pass `initial` to pre-fill for editing.
function RowModal({
  title,
  submitLabel,
  sectionTitle,
  amountLabel,
  showDue,
  showType,
  typeOptions,
  onAddType,
  editableTypes,
  onRenameType,
  onDeleteType,
  showIcons,
  iconForName,
  onSetTypeIcon,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  sectionTitle: string;
  amountLabel: string;
  showDue: boolean;
  showType: boolean;
  typeOptions: string[];
  onAddType: (type: string) => void;
  editableTypes?: Set<string>;
  onRenameType?: (oldName: string, newName: string) => void;
  onDeleteType?: (name: string) => void;
  showIcons?: boolean;
  iconForName?: (name: string) => string;
  onSetTypeIcon?: (name: string, icon: string) => void;
  initial?: { type: string; category: string; amount: string; due: string };
  onClose: () => void;
  onSubmit: (data: {
    type: string;
    category: string;
    amount: string;
    due: string;
  }) => void;
}) {
  const [type, setType] = useState(initial?.type ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [due, setDue] = useState(initial?.due ?? "");

  // Close on Escape for quick keyboard dismissal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSubmit = type.trim() !== "" || category.trim() !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      type: type.trim(),
      category: category.trim(),
      amount: amount.trim(),
      due: due.trim(),
    });
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
        aria-label={`${title} · ${sectionTitle}`}
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-zinc-900">
              {title}
            </h3>
            <p className="mt-0.5 text-sm text-amber-900/60">{sectionTitle}</p>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {showType && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-zinc-900">Type</span>
                <BudgetDropdown
                  value={type}
                  options={
                    typeOptions.includes(type) || !type
                      ? typeOptions
                      : [type, ...typeOptions]
                  }
                  onChange={setType}
                  onAddNew={onAddType}
                  onRename={onRenameType}
                  onDelete={onDeleteType}
                  isEditable={
                    editableTypes
                      ? (opt) => editableTypes.has(opt)
                      : undefined
                  }
                  placeholder="Select a type"
                  addLabel="Add new type…"
                  ariaLabel="Type"
                />
              </label>
            )}

            {showType && showIcons && type.trim() !== "" && (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-sm font-medium text-zinc-900">Icon</span>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORY_ICONS.map((icon) => {
                    const selected = iconForName?.(type) === icon.id;
                    return (
                      <button
                        key={icon.id}
                        type="button"
                        title={icon.label}
                        aria-label={icon.label}
                        aria-pressed={selected}
                        onClick={() =>
                          onSetTypeIcon?.(type, selected ? "" : icon.id)
                        }
                        className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                          selected
                            ? "border-amber-600 bg-amber-100 text-amber-800"
                            : "border-amber-900/15 text-amber-900/60 hover:border-amber-600/40 hover:bg-amber-900/5"
                        }`}
                      >
                        <CategoryIcon id={icon.id} size={18} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-900">Category</span>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Category name"
                className={fieldClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-zinc-900">
                {amountLabel}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={fieldClass}
              />
            </label>

            {showDue && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-zinc-900">
                  Due date
                </span>
                <input
                  type="text"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  placeholder="dd/mm/yyyy"
                  className={fieldClass}
                />
              </label>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
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
            {submitLabel}
          </button>
        </form>
      </div>
    </div>
  );
}

// Modal to create a new table or rename an existing one, with a toggle for the
// optional Fälligkeitsdatum column.
function TableModal({
  mode,
  initial,
  onClose,
  onSubmit,
}: {
  mode: "add" | "edit";
  initial?: CustomTable;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    showDue: boolean;
    showType: boolean;
  }) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [showDue, setShowDue] = useState(initial?.showDue ?? false);
  const [showType, setShowType] = useState(initial?.showType ?? true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSubmit = title.trim() !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ title: title.trim(), showDue, showType });
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
        className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={mode === "edit" ? "Edit table" : "Add table"}
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-zinc-900">
              {mode === "edit" ? "Edit table" : "Add table"}
            </h3>
            <p className="mt-0.5 text-sm text-amber-900/60">
              {mode === "edit"
                ? "Rename it or turn its columns on and off."
                : "Name it and pick its columns."}
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-900">Table name</span>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Subscriptions"
              className={fieldClass}
            />
          </label>

          <button
            type="button"
            onClick={() => setShowType((v) => !v)}
            className="flex items-center justify-between rounded-xl border border-amber-900/15 bg-amber-50/40 px-3.5 py-3 text-left transition-colors hover:border-amber-600/40"
          >
            <span>
              <span className="block text-sm font-medium text-zinc-900">
                Type column
              </span>
              <span className="block text-xs text-amber-900/60">
                Show a Type column in this table.
              </span>
            </span>
            <span
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                showType ? "bg-amber-700" : "bg-amber-900/20"
              }`}
              aria-hidden="true"
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  showType ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowDue((v) => !v)}
            className="flex items-center justify-between rounded-xl border border-amber-900/15 bg-amber-50/40 px-3.5 py-3 text-left transition-colors hover:border-amber-600/40"
          >
            <span>
              <span className="block text-sm font-medium text-zinc-900">
                Due-date column
              </span>
              <span className="block text-xs text-amber-900/60">
                Show a Fälligkeitsdatum column in this table.
              </span>
            </span>
            <span
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                showDue ? "bg-amber-700" : "bg-amber-900/20"
              }`}
              aria-hidden="true"
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  showDue ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-amber-900 to-amber-700 px-4 py-3 text-sm font-semibold text-amber-50 shadow-md shadow-amber-900/20 transition-all hover:from-amber-800 hover:to-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
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
            {mode === "edit" ? "Save changes" : "Add table"}
          </button>
        </form>
      </div>
    </div>
  );
}

// A full-width clickable row that appends a new line item, styled with the warm
// amber gradient used for the add-expense row on the dashboard.
function AddRow({
  colSpan,
  onClick,
}: {
  colSpan: number;
  onClick: () => void;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-center justify-center gap-2 border-t border-dashed border-amber-200/70 px-5 py-2.5 text-sm font-medium text-amber-900/50 transition-colors hover:bg-amber-900/5 hover:text-amber-900 focus-visible:bg-amber-50 focus-visible:text-amber-900 focus-visible:outline-none"
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
          Add row
        </button>
      </td>
    </tr>
  );
}

// Row action cluster (edit + delete), revealed when the row is hovered or
// focused so the resting table stays clean.
function RowActions({
  onEdit,
  onDelete,
  label,
}: {
  onEdit: () => void;
  onDelete: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <EditButton onClick={onEdit} label={`Edit ${label}`} />
      <DeleteButton onClick={onDelete} label={`Delete ${label}`} />
    </div>
  );
}

// Small pencil-icon button used to open the edit modal for a row.
function EditButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-900/40 transition-colors hover:bg-amber-900/5 hover:text-amber-900"
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
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

// Small trash-icon button used to remove a custom row.
function DeleteButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-900/40 transition-colors hover:bg-red-50 hover:text-red-600"
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
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    </button>
  );
}
