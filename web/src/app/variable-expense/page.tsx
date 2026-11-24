import type { Expense } from "@/lib/types";
import { getExpenses } from "@/lib/server-api";
import ExpenseDashboard from "../expense-dashboard";

// Server Component for the Variable Expense view. It loads the initial list of
// expenses on the server and hands it to the interactive client dashboard. If
// the backend is unreachable, the UI renders with an error message instead of
// crashing the page.
export default async function VariableExpensePage() {
  let expenses: Expense[] = [];
  let initialError: string | undefined;

  try {
    expenses = await getExpenses();
  } catch {
    initialError = "Could not reach the API. Is the Go server running on :8080?";
  }

  return (
    <ExpenseDashboard initialExpenses={expenses} initialError={initialError} />
  );
}
