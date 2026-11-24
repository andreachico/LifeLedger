import { redirect } from "next/navigation";

// The Variable Expense view now lives at its own named route (/variable-expense).
// "/" is still the login redirect and middleware landing target, so send it on
// to the canonical route rather than duplicating the dashboard here.
export default function Home() {
  redirect("/variable-expense");
}
