"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/8bit/drawer";
import { cn } from "@/lib/utils";

import "./add.css";

// Where the confirmation card shows (SPEC §14.2), on the Overworld and on place detail.

// Desktop: a side panel on the right, the height minus 1rem at each end; it scrolls inside only
// on short windows. Its width is --confirm-width (add.css). The caller positions it (absolute
// over the map, fixed elsewhere).
export function ConfirmPanel({
  title = "Confirm visit",
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & { title?: string }) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      {...props}
      className={cn("top-4 right-[calc(1rem+6px)] bottom-4 flex w-(--confirm-width) flex-col", className)}
    >
      <Card font="normal" className="flex max-h-full min-h-0 flex-col">
        <CardHeader>
          <CardTitle id={titleId}>{title}</CardTitle>
        </CardHeader>
        {/* pb: the last buttons' pixel border and shadow reach 10px below them, and their focus
            ring 12px, which would otherwise make the content scroll or clip the ring. pt + -mt: the scroll box starts 10px higher, with
            the content where it was, so the focus outline of the drop-pin link on the first row
            isn't clipped. scroll-py: so is that of a field scrolled into view by keyboard focus. */}
        <CardContent className="-mt-2.5 min-h-0 scroll-py-3 overflow-y-auto pt-2.5 pb-3">{children}</CardContent>
      </Card>
    </section>
  );
}

// Mobile: the slide-up drawer. Its bottom sits on the tab bar (4rem + the safe-area inset), and it
// never reaches past the top safe area (plus 0.5rem).
// onClosed runs as soon as it closes, by any route: a swipe, the overlay, Escape, or the caller
// setting `open` to false (after a save, say). Vaul only reports the closes it starts itself, so
// the drawer watches `open`. While it slides away it keeps showing what it showed when it closed,
// so onClosed can reset the caller's state at once and the next opening starts afresh.
// repositionInputs off: with the keyboard open, Vaul sets an inline height and bottom on the
// drawer and, once the keyboard closes, restores the height it had while the input was focused,
// so the confirmation card that replaces the input scrolls inside a too-short drawer, and the
// drawer drops over the tab bar. Without it, iOS scrolls the focused input into view itself.
export function AddDrawer({
  open,
  onClose,
  onClosed,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const closed = useRef(onClosed);
  useLayoutEffect(() => {
    closed.current = onClosed;
  });
  useEffect(() => {
    if (!open) return;
    return () => closed.current();
  }, [open]);

  const [shown, setShown] = useState({ title, children });
  if (open && (shown.title !== title || shown.children !== children)) setShown({ title, children });
  const content = open ? { title, children } : shown;

  return (
    <Drawer
      open={open}
      repositionInputs={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent
        font="normal"
        aria-describedby={undefined}
        className="add-drawer text-body data-[vaul-drawer-direction=bottom]:bottom-[calc(4rem+env(safe-area-inset-bottom))] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-4rem-env(safe-area-inset-bottom)-env(safe-area-inset-top)-0.5rem)]"
      >
        {/* scroll-py: a field scrolled into view by keyboard focus keeps its focus outline inside. */}
        <div className="flex min-h-0 scroll-py-3 flex-col gap-4 overflow-y-auto px-4 pt-6 pb-4">
          <DrawerTitle className="text-h3">{content.title}</DrawerTitle>
          {content.children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
