"use client";

import { createContext, use, useCallback, useMemo, useState } from "react";

import { usePathname, useRouter } from "next/navigation";

// "Add Visit" in the sidebar and tab bar opens the add panel, which lives on the Overworld
// (SPEC §14.1, §14.2): a speech bubble beside the sidebar on desktop, the drawer on mobile. On
// the Overworld it toggles the panel; from another page it navigates to / with the panel open.
// The nav items carry data-add-visit, which the bubbles point at (useAddVisitBubble).

type AddVisit = {
  // Whether the add panel is open on the Overworld.
  open: boolean;
  toggle: () => void;
  close: () => void;
};

const AddVisitContext = createContext<AddVisit | null>(null);

// Created by the app shell, which renders the nav items and provides it to the pages.
export function useAddVisitController(): AddVisit {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Leaving the Overworld closes the panel, so it doesn't reopen on the way back.
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    if (pathname !== "/") setOpen(false);
  }

  const toggle = useCallback(() => {
    if (pathname === "/") return setOpen((current) => !current);
    setOpen(true);
    router.push("/");
  }, [pathname, router]);
  const close = useCallback(() => setOpen(false), []);

  return useMemo(() => ({ open, toggle, close }), [open, toggle, close]);
}

export const AddVisitProvider = AddVisitContext;

export function useAddVisit() {
  const context = use(AddVisitContext);
  if (!context) throw new Error("Add Visit needs the app shell");
  return context;
}

// A speech bubble whose tail points at the visible Add Visit nav item: to the right of the
// desktop sidebar, level with the item (tail pointing left), or above the mobile tab bar and the
// map's attribution, over the Add Visit tab (tail pointing down). The bubble element is
// position: fixed and holds its .speech-tail as a direct child (shell.css). `overlap` is how far
// inside the bubble's box its border starts: 6 for the RPG box, 0 for an 8bitcn Card, whose side
// borders sit outside it. `watch` also re-places it when the Overworld's DOM changes, for the
// attribution, which fills in after the map loads. A server-rendered bubble should start with
// visibility: hidden; placing it makes it visible.
export function useAddVisitBubble(overlap: number, watch = false) {
  return useCallback(
    (bubble: HTMLElement | null) => {
      if (!bubble) return;
      const place = () => placeBubble(bubble, overlap);
      place();
      addEventListener("resize", place);
      const observer = new MutationObserver(place);
      const overworld = bubble.closest(".overworld");
      if (watch && overworld) observer.observe(overworld, { childList: true, subtree: true });
      return () => {
        removeEventListener("resize", place);
        observer.disconnect();
      };
    },
    [overlap, watch],
  );
}

// The tail is 24px long (6px of it over the bubble's border) and 30px wide, and its tip stops
// 8px short of what it points at: past the sidebar's 4px shadow plus a 4px gap, or a gap above
// the tab bar. The left tail sits 30px down from the bubble's top (shell.css).
const TAIL_LENGTH = 24;
const TAIL_GAP = 8;
const TAIL_DOWN = 30;

function placeBubble(bubble: HTMLElement, overlap: number) {
  const anchor = Array.from(document.querySelectorAll<HTMLElement>("[data-add-visit]")).find(
    (element) => element.getClientRects().length > 0,
  );
  if (!anchor) return;
  const item = anchor.getBoundingClientRect();
  const sidebar = anchor.closest("[data-sidebar]");
  const reach = TAIL_LENGTH - overlap;
  const style = bubble.style;

  if (sidebar) {
    bubble.dataset.tail = "left";
    style.left = `${Math.round(sidebar.getBoundingClientRect().right + TAIL_GAP + reach)}px`;
    style.top = `${Math.round(item.top + item.height / 2 - TAIL_DOWN)}px`;
    style.bottom = "";
  } else {
    // The tab bar (the item's nav), or the attribution when it's in the way.
    let tip = (anchor.closest("nav") ?? anchor).getBoundingClientRect().top;
    const attribution = document.querySelector(".maplibregl-ctrl-bottom-right")?.getBoundingClientRect();
    if (attribution?.height) tip = Math.min(tip, attribution.top);
    bubble.dataset.tail = "down";
    style.left = style.top = "";
    style.bottom = `${Math.round(document.documentElement.clientHeight - tip + TAIL_GAP + reach)}px`;
    const box = bubble.getBoundingClientRect();
    const x = item.left + item.width / 2 - box.left - 15;
    style.setProperty("--tail-x", `${Math.round(Math.min(Math.max(x, 12), box.width - 42))}px`);
  }
  style.visibility = "visible";
}
