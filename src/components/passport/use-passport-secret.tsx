"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { loadPassport } from "@/app/(app)/actions";
import { secretClicks } from "@/lib/passport-clicks";
import type { PassportData } from "@/lib/stats/passport";

import "./passport-trigger.css";

// The overlay's code loads on a trigger's first activation (it's in its own chunk), so it adds
// nothing to a normal page load; the third finds it ready, or waits on it without a fallback.
const loadOverlay = () => import("@/components/passport/passport-overlay");
const PassportOverlay = lazy(loadOverlay);

// What the overlay shows: the numbers, null while they load, or "error".
export type PassportState = PassportData | null | "error";

type Step = "wiggle" | "flip" | null;

// A passport secret trigger (SPEC §15.1): the sidebar logo (a link, so `navigate`) or the
// profile's passport (which already has the numbers, so `data`). Spread `triggerProps` on the
// trigger, `spriteProps` on its sprite (the wiggle and flip, passport-trigger.css), and render
// `overlay`. Without `data`, the numbers are fetched on each count's first activation.
export function usePassportSecret({ data, navigate }: { data?: PassportData; navigate?: () => void }) {
  const [step, setStep] = useState<Step>(null);
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState<PassportState>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const navigateRef = useRef(navigate);
  const clicks = useRef<ReturnType<typeof secretClicks>>(null);

  useEffect(() => {
    navigateRef.current = navigate;
  });

  useEffect(() => {
    const counter = secretClicks({
      wiggle: () => {
        setStep("wiggle");
        loadOverlay().catch(() => {});
        if (!data) {
          loadPassport().then(setFetched, (error) => {
            console.error("passport stats failed:", error);
            setFetched((current) => current ?? "error");
          });
        }
      },
      flip: () => setStep("flip"),
      open: () => {
        setStep(null);
        setOpen(true);
      },
      ...(navigateRef.current && { navigate: () => navigateRef.current?.() }),
    });
    clicks.current = counter;
    return () => counter.dispose();
  }, [data]);

  function onClick(event: React.MouseEvent<HTMLElement>) {
    trigger.current = event.currentTarget;
    // A modified click opens the link as usual (a new tab or window) and isn't counted.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    clicks.current?.activate();
  }

  // Enter fires a click on links and buttons alike, and Space on buttons; Space on a link
  // counts here.
  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== " " || !(event.currentTarget instanceof HTMLAnchorElement)) return;
    event.preventDefault();
    trigger.current = event.currentTarget;
    clicks.current?.activate();
  }

  return {
    triggerProps: { onClick, onKeyDown },
    spriteProps: {
      "data-passport-step": step ?? undefined,
      onAnimationEnd: () => setStep(null),
    },
    overlay: open && (
      <Suspense fallback={null}>
        <PassportOverlay
          data={data ?? fetched}
          onClose={() => setOpen(false)}
          // Focus goes back to the trigger, even where a click doesn't focus it (Safari).
          returnFocus={() => trigger.current?.focus()}
        />
      </Suspense>
    ),
  };
}
