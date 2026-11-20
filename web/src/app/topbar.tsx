"use client";

// Top bar with a breadcrumb and a static profile area. There's no auth yet, so
// the bell and avatar are decorative placeholders. The breadcrumb is derived
// from the current route so it reflects wherever the user has navigated.
import Link from "next/link";
import { usePathname } from "next/navigation";

// Human-readable labels for each route segment. Segments without an entry fall
// back to a title-cased version of the segment itself (e.g. an unknown slug).
const SEGMENT_LABELS: Record<string, string> = {
  budget: "Budget Sheet",
  income: "Income",
  savings: "Savings",
  travel: "Travel",
  investments: "Investments",
  debts: "Debts",
  year: "Year at a Glance",
  habits: "Habit Tracker",
};

type Crumb = { label: string; href: string };

function titleCase(segment: string): string {
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);

  // "/overview" is the Workspace dashboard itself — the "Workspace" root link
  // already represents it, so there's no extra crumb to add.
  if (segments.length === 0 || pathname === "/overview") {
    // The root route ("/") is the Variable Expense overview.
    return segments.length === 0 ? [{ label: "Overview", href: "/" }] : [];
  }

  let href = "";
  return segments.map((segment) => {
    href += `/${segment}`;
    const label = SEGMENT_LABELS[segment] ?? titleCase(segment);
    return { label, href };
  });
}

export default function TopBar() {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

  return (
    <header className="flex items-center justify-between border-b border-amber-900/15 bg-white px-6 py-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <Link href="/overview" className="text-amber-900/50 hover:text-amber-900">
          Workspace
        </Link>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <span key={crumb.href} className="flex items-center gap-2">
              <span className="text-amber-900/30">›</span>
              {isLast ? (
                <span
                  aria-current="page"
                  className="font-semibold text-zinc-900"
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-amber-900/50 hover:text-amber-900"
                >
                  {crumb.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      <div className="flex items-center gap-5">
        <span className="hidden text-sm text-amber-900/60 sm:block">
          A little clarity goes a long way.
        </span>

        <button
          type="button"
          aria-label="Notifications"
          className="relative text-amber-900/70 hover:text-amber-900"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          </svg>
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-800" />
        </button>

        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-200 text-xs font-semibold text-amber-900">
          AC
        </span>
      </div>
    </header>
  );
}
