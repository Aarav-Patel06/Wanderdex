"use client";

import { createContext, use, useEffect, useMemo, useRef } from "react";

import { useRouter } from "next/navigation";

// "Add Visit" in the sidebar and tab bar opens the add panel, which lives on the Overworld
// (SPEC §14.1). On the Overworld it opens at once; from another page it navigates to / and
// opens as soon as the add panel mounts there.

type AddVisit = {
  request: () => void;
  // The add panel's open function; returns the unregister function.
  register: (open: () => void) => () => void;
};

const AddVisitContext = createContext<AddVisit | null>(null);

// Created by the app shell, which renders the nav items and provides it to the pages.
export function useAddVisitController(): AddVisit {
  const router = useRouter();
  const open = useRef<(() => void) | null>(null);
  const pending = useRef(false);

  return useMemo(
    () => ({
      request() {
        if (open.current) return open.current();
        pending.current = true;
        router.push("/");
      },
      register(fn) {
        open.current = fn;
        if (pending.current) {
          pending.current = false;
          fn();
        }
        return () => {
          if (open.current === fn) open.current = null;
        };
      },
    }),
    [router],
  );
}

export const AddVisitProvider = AddVisitContext;

function useAddVisitContext() {
  const context = use(AddVisitContext);
  if (!context) throw new Error("Add Visit needs the app shell");
  return context;
}

// For anything that opens the add panel (e.g. the Overworld's empty-state hint).
export function useAddVisit() {
  return useAddVisitContext().request;
}

// For the add panel: `open` runs on each request. Keep it stable (useCallback).
export function useAddVisitTarget(open: () => void) {
  const { register } = useAddVisitContext();
  useEffect(() => register(open), [register, open]);
}
