import type { ReactNode } from "react";

// The 25 preset icons a user can attach to a variable-expense category. Each
// entry's `id` is what gets stored; `paths` is the inner SVG of a 24×24,
// stroke-based (feather-style) icon. Shared by the budget sheet and the expense
// dashboard so both offer the same choices from a single source of truth.
export const CATEGORY_ICONS: {
  id: string;
  label: string;
  paths: ReactNode;
}[] = [
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
    paths: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  },
  {
    id: "utilities",
    label: "Utilities",
    paths: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
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
  {
    id: "pet",
    label: "Pets",
    paths: (
      <>
        <circle cx="5.5" cy="12.5" r="1.5" />
        <circle cx="9.5" cy="8.5" r="1.5" />
        <circle cx="14.5" cy="8.5" r="1.5" />
        <circle cx="18.5" cy="12.5" r="1.5" />
        <path d="M8 16a4 4 0 0 1 8 0c0 2-2 3-4 3s-4-1-4-3z" />
      </>
    ),
  },
  {
    id: "fuel",
    label: "Fuel",
    paths: (
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    ),
  },
  {
    id: "pharmacy",
    label: "Pharmacy",
    paths: (
      <>
        <path d="M10.5 20.5 20.5 10.5a5 5 0 0 0-7-7l-10 10a5 5 0 0 0 7 7z" />
        <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
      </>
    ),
  },
  {
    id: "gaming",
    label: "Gaming",
    paths: (
      <>
        <line x1="6" y1="11" x2="10" y2="11" />
        <line x1="8" y1="9" x2="8" y2="13" />
        <line x1="15" y1="12" x2="15.01" y2="12" />
        <line x1="18" y1="10" x2="18.01" y2="10" />
        <rect x="2" y="6" width="20" height="12" rx="6" />
      </>
    ),
  },
  {
    id: "star",
    label: "Favorites",
    paths: (
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    ),
  },
];

// Renders a preset category icon by id, or nothing when the id is unknown/empty.
export function CategoryGlyph({
  id,
  size = 16,
}: {
  id?: string;
  size?: number;
}) {
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

// A unique pastel background (+ matching text) per icon id. Full class strings
// are used so Tailwind's compiler can detect them. Kept pastel (100/200 shades)
// on purpose — no bright/saturated fills.
const ICON_COLORS: Record<string, string> = {
  cart: "bg-emerald-100 text-emerald-700",
  food: "bg-rose-100 text-rose-700",
  car: "bg-sky-100 text-sky-700",
  home: "bg-amber-100 text-amber-700",
  health: "bg-red-100 text-red-700",
  gift: "bg-pink-100 text-pink-700",
  fun: "bg-violet-100 text-violet-700",
  shopping: "bg-orange-100 text-orange-700",
  coffee: "bg-yellow-100 text-yellow-700",
  travel: "bg-cyan-100 text-cyan-700",
  phone: "bg-teal-100 text-teal-700",
  wifi: "bg-blue-100 text-blue-700",
  book: "bg-indigo-100 text-indigo-700",
  music: "bg-fuchsia-100 text-fuchsia-700",
  fitness: "bg-lime-100 text-lime-700",
  utilities: "bg-green-100 text-green-700",
  beauty: "bg-purple-100 text-purple-700",
  repairs: "bg-stone-200 text-stone-700",
  camera: "bg-slate-200 text-slate-700",
  subscriptions: "bg-neutral-200 text-neutral-700",
  pet: "bg-amber-200 text-amber-800",
  fuel: "bg-red-200 text-red-800",
  pharmacy: "bg-sky-200 text-sky-800",
  gaming: "bg-indigo-200 text-indigo-800",
  star: "bg-yellow-200 text-yellow-800",
};

// Returns the pastel background/text classes for an icon id, or a neutral
// fallback when the id is unknown/empty.
export function iconColor(id?: string): string {
  return (id && ICON_COLORS[id]) || "bg-zinc-100 text-zinc-600";
}
