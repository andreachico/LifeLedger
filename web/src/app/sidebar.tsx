"use client";

// Left navigation. A dark, serif-branded rail grouping the workspace views under
// "Finance Overview", "Year Overview" and "Habits", with the Dashboard pinned at
// the top and the signed-in user at the bottom. The active route is highlighted
// with the amber/terracotta accent.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/lib/api";
import type { User } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Finance Overview",
    items: [
      {
        href: "/budget",
        label: "Budget Sheet",
        icon: (
          <>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1" />
          </>
        ),
      },
      {
        href: "/variable-expense",
        label: "Variable Expense",
        icon: (
          <>
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </>
        ),
      },
      {
        href: "/income",
        label: "Income",
        icon: (
          <>
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </>
        ),
      },
      {
        href: "/savings",
        label: "Savings",
        icon: (
          <>
            <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5Z" />
            <line x1="16" y1="10" x2="16" y2="10" />
          </>
        ),
      },
      {
        href: "/travel",
        label: "Travel",
        icon: (
          <>
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="12" y1="11" x2="12" y2="16" />
          </>
        ),
      },
      {
        href: "/investments",
        label: "Investments",
        icon: (
          <>
            <line x1="3" y1="3" x2="3" y2="21" />
            <line x1="3" y1="21" x2="21" y2="21" />
            <polyline points="7 14 11 10 14 13 20 7" />
            <polyline points="20 11 20 7 16 7" />
          </>
        ),
      },
      {
        href: "/debts",
        label: "Debts",
        icon: (
          <>
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
            <line x1="6" y1="15" x2="10" y2="15" />
          </>
        ),
      },
    ],
  },
  {
    title: "Year Overview",
    items: [
      {
        href: "/year",
        label: "Year at a Glance",
        icon: (
          <>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </>
        ),
      },
    ],
  },
  {
    title: "Habits",
    items: [
      {
        href: "/habits",
        label: "Habit Tracker",
        icon: (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="m9 12 2 2 4-4" />
          </>
        ),
      },
    ],
  },
];

// Shared classes for a nav link, highlighting the active route with the
// terracotta accent and dimming the rest against the dark rail.
function navClass(active: boolean): string {
  return `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
    active
      ? "bg-[#c06a3e] text-white shadow-sm shadow-black/20"
      : "text-amber-50/65 hover:bg-white/5 hover:text-amber-50"
  }`;
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-[#1b241f] p-4 text-amber-50 sm:flex">
      {/* Brand */}
      <div className="my-3 flex items-center gap-3 px-2 pb-5 pt-1">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#c06a3e] text-white shadow-md shadow-black/30">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
        </span>
        <span className="flex flex-col leading-tight">
          <span className="font-serif text-xl font-semibold tracking-tight text-amber-50">
            LifeLedger
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/40">
            Money · Habits · Year
          </span>
        </span>
      </div>

      {/* Workspace */}
      <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-amber-100/35">
        Workspace
      </div>
      <nav className="flex flex-col gap-5">
        <Link
          href="/overview"
          aria-current={pathname === "/overview" ? "page" : undefined}
          className={navClass(pathname === "/overview")}
        >
          <NavIcon>
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
          </NavIcon>
          Dashboard
        </Link>

        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-1">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-amber-100/35">
              {group.title}
            </div>
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={navClass(active)}
                >
                  <NavIcon>{item.icon}</NavIcon>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <UserMenu />
    </aside>
  );
}

// UserMenu sits at the bottom of the sidebar. It shows who's signed in and lets
// them log out, which clears the session cookie and returns to the login page.
function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: User | null) => {
        if (active) setUser(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="mt-auto border-t border-white/10 pt-3">
      <div className="group flex items-center gap-3 px-2 py-1">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d4a24a] text-xs font-semibold uppercase text-[#1b241f]">
          {user ? initials(user) : "··"}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-medium text-amber-50">
            {user ? fullName(user) : "…"}
          </span>
          <span className="text-[11px] text-amber-100/40">Signed in</span>
        </span>
        <button
          type="button"
          onClick={handleLogout}
          title="Sign out"
          aria-label="Sign out"
          className="ml-auto rounded-lg p-2 text-amber-50/60 hover:bg-white/5 hover:text-amber-50"
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
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// fullName prefers the person's name, falling back to the username for accounts
// created before names were collected.
function fullName(user: User): string {
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name || user.username;
}

// initials builds a two-letter avatar label from the name, or the username.
function initials(user: User): string {
  const first = user.firstName.trim();
  const last = user.lastName.trim();
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}` || first.slice(0, 2);
  }
  return user.username.slice(0, 2);
}
