import HabitTracker from "./habit-tracker";
import { getHabits } from "@/lib/server-api";

// Server wrapper for the Habit Tracker. Habits are loaded from the backend
// (per-user, persisted), then handed to the interactive client component.
export default async function HabitTrackerPage() {
  const habits = await getHabits();
  return <HabitTracker initialHabits={habits} />;
}
