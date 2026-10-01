"use client";

import { useId } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/8bit/drawer";
import { cn } from "@/lib/utils";

import "./add.css";

// Where the confirmation card shows (SPEC §14.2), on the Overworld and on place detail.

// Desktop: a side panel on the right, the height minus 1rem at each end; it scrolls inside only
// on short windows. Its width is --confirm-width (add.css). The caller positions it (absolute
// over the map, fixed elsewhere).
export function ConfirmPanel({ className, children, ...props }: React.ComponentProps<"section">) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      {...props}
      className={cn("top-4 right-[calc(1rem+6px)] bottom-4 flex w-(--confirm-width) flex-col", className)}
    >
      <Card font="normal" className="flex max-h-full min-h-0 flex-col">
        <CardHeader>
          <CardTitle id={titleId}>Confirm visit</CardTitle>
        </CardHeader>
        {/* pb: the last button's pixel border and shadow reach 10px below it, which would
            otherwise make the content scroll. */}
        <CardContent className="min-h-0 overflow-y-auto pb-2.5">{children}</CardContent>
      </Card>
    </section>
  );
}

// Mobile: the slide-up drawer. Its bottom sits on the tab bar (4rem + the safe-area inset), and it
// never reaches past the top safe area (plus 0.5rem). onClosed runs once it has slid away.
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
  return (
    <Drawer
      open={open}
      repositionInputs={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onAnimationEnd={(next) => {
        if (!next) onClosed();
      }}
    >
      <DrawerContent
        font="normal"
        aria-describedby={undefined}
        className="add-drawer text-body data-[vaul-drawer-direction=bottom]:bottom-[calc(4rem+env(safe-area-inset-bottom))] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-4rem-env(safe-area-inset-bottom)-env(safe-area-inset-top)-0.5rem)]"
      >
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pt-6 pb-4">
          <DrawerTitle className="text-h3">{title}</DrawerTitle>
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
