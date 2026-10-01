"use client";

import { useSyncExternalStore } from "react";

// Tailwind's md breakpoint, where the shell switches to the desktop sidebar.
const DESKTOP = "(min-width: 48rem)";

function subscribeDesktop(onChange: () => void) {
  const query = matchMedia(DESKTOP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useIsDesktop() {
  return useSyncExternalStore(subscribeDesktop, () => matchMedia(DESKTOP).matches, () => false);
}
