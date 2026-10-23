import { useSyncExternalStore } from "react"

const noop = () => () => {}

/** Reads a browser-only value without a hydration mismatch (server renders `fallback`). */
export function useClientValue<T extends string | number | boolean | null>(
  get: () => T,
  fallback: T,
): T {
  return useSyncExternalStore(noop, get, () => fallback)
}
