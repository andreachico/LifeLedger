"use client";

// Client-side helpers for scoping browser-local data (localStorage) to the
// signed-in account. Some views (Travel, Year at a Glance, budget Type options)
// persist to localStorage rather than the backend. localStorage is shared across
// every account on the same browser, so keys must be namespaced per user —
// otherwise a freshly created account would see the previous account's data.
import { useEffect, useState } from "react";
import type { User } from "./types";

// useUserId fetches the current account's id once on mount. `ready` flips to true
// after the lookup resolves (whether or not a user was found), so callers can
// wait before reading per-user localStorage.
export function useUserId(): { userId: number | null; ready: boolean } {
  const [userId, setUserId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: User | null) => {
        if (active) setUserId(data?.id ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return { userId, ready };
}

// userScopedKey namespaces a localStorage key with the account id so each user
// gets their own storage on a shared browser. A null id (not signed in) falls
// back to the base key.
export function userScopedKey(base: string, userId: number | null): string {
  return userId == null ? base : `${base}::u${userId}`;
}

// adoptLegacyKey returns the raw localStorage value to use for `base` under the
// current account, performing a one-time migration from the old (global,
// un-namespaced) key when needed:
//   1. If this account already has a namespaced value, use it.
//   2. Otherwise, if a legacy global value exists, move it into this account's
//      namespace and DELETE the global copy, so other accounts on the same
//      browser can't inherit it afterwards.
//   3. Otherwise there's nothing to load (a fresh account starts empty).
// Returns the raw string (caller parses) or null if there's nothing stored.
export function adoptLegacyKey(
  base: string,
  userId: number | null,
): string | null {
  const scopedKey = userScopedKey(base, userId);
  try {
    const scoped = localStorage.getItem(scopedKey);
    if (scoped != null) return scoped;
    // Not signed in: the scoped key is the base key, so there's nothing to move.
    if (userId == null) return null;
    const legacy = localStorage.getItem(base);
    if (legacy == null) return null;
    localStorage.setItem(scopedKey, legacy);
    localStorage.removeItem(base);
    return legacy;
  } catch {
    return null;
  }
}

