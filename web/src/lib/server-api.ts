import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type {
  BudgetPlan,
  Debt,
  Expense,
  Habit,
  Income,
  InvestmentSale,
  Saving,
} from "./types";

// Server-side data loading. Unlike the browser client (which uses the "/api"
// proxy), a Server Component runs on the server and must call the backend with
// an absolute URL. This is a plain server-to-server request, so there's no CORS
// involved. Set BACKEND_URL in production; it defaults to local dev.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8080";

// authHeaders forwards the incoming request's cookies to the backend. Because
// the Server Component runs on the server, the browser's session cookie isn't
// attached automatically — we have to copy it onto the outgoing request so the
// API knows which user is asking.
async function authHeaders(): Promise<HeadersInit> {
  const cookieHeader = (await cookies()).toString();
  return cookieHeader ? { cookie: cookieHeader } : {};
}

export async function getExpenses(): Promise<Expense[]> {
  // no-store keeps the list fresh on every request (it changes as users add
  // expenses). For heavily cached data you'd use Next's caching instead.
  const res = await fetch(`${BACKEND_URL}/expenses`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  // An expired or missing session sends us to the login page.
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    throw new Error(`failed to load expenses (${res.status})`);
  }
  return res.json() as Promise<Expense[]>;
}

// getBudgetPlan loads the saved budget plan for a month ("YYYY-MM"). An empty
// object means nothing has been saved for that month yet.
export async function getBudgetPlan(month: string): Promise<BudgetPlan> {
  const res = await fetch(`${BACKEND_URL}/budget?month=${month}`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    throw new Error(`failed to load budget (${res.status})`);
  }
  return res.json() as Promise<BudgetPlan>;
}

// getHabits loads the caller's habits (each with its check-in dates) for the
// habit tracker's initial render.
export async function getHabits(): Promise<Habit[]> {
  const res = await fetch(`${BACKEND_URL}/habits`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    throw new Error(`failed to load habits (${res.status})`);
  }
  return res.json() as Promise<Habit[]>;
}

// getIncome loads a month's ("YYYY-MM") income entries for server-rendered
// summaries like the Workspace dashboard.
export async function getIncome(month: string): Promise<Income[]> {
  const res = await fetch(`${BACKEND_URL}/income?month=${month}`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    throw new Error(`failed to load income (${res.status})`);
  }
  return res.json() as Promise<Income[]>;
}

// getSavings loads all recorded fund withdrawals.
export async function getSavings(): Promise<Saving[]> {
  const res = await fetch(`${BACKEND_URL}/savings`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    throw new Error(`failed to load savings (${res.status})`);
  }
  return res.json() as Promise<Saving[]>;
}

// getInvestmentSales loads all recorded holding sales.
export async function getInvestmentSales(): Promise<InvestmentSale[]> {
  const res = await fetch(`${BACKEND_URL}/investments`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    throw new Error(`failed to load investments (${res.status})`);
  }
  return res.json() as Promise<InvestmentSale[]>;
}

// getDebts loads the caller's one-time debts and installment plans.
export async function getDebts(): Promise<Debt[]> {
  const res = await fetch(`${BACKEND_URL}/debts`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    throw new Error(`failed to load debts (${res.status})`);
  }
  return res.json() as Promise<Debt[]>;
}

// getBudgetBreakdown returns each budget line's amount per month across every
// saved month, keyed by entry key ("section:row") then month.
export async function getBudgetBreakdown(): Promise<
  Record<string, Record<string, number>>
> {
  const res = await fetch(`${BACKEND_URL}/budget/breakdown`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    throw new Error(`failed to load budget breakdown (${res.status})`);
  }
  return res.json() as Promise<Record<string, Record<string, number>>>;
}

// getSavingsFunds loads the user's savings fund catalog (names only), the same
// list shown in the Savings tab's dropdown.
export async function getSavingsFunds(): Promise<string[]> {
  const res = await fetch(`${BACKEND_URL}/savings/funds`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    throw new Error(`failed to load savings funds (${res.status})`);
  }
  return res.json() as Promise<string[]>;
}

// getInvestmentHoldings loads the user's investment holding catalog (names
// only), the same list shown in the Investments tab's dropdown.
export async function getInvestmentHoldings(): Promise<string[]> {
  const res = await fetch(`${BACKEND_URL}/investments/holdings`, {
    cache: "no-store",
    headers: await authHeaders(),
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    throw new Error(`failed to load investment holdings (${res.status})`);
  }
  return res.json() as Promise<string[]>;
}
