"use client";

import { useRef, useState } from "react";

import { ChoiceMarker, rpgChoice, rpgChoices } from "@/components/dialogs/rpg-box";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/8bit/dialog";
import { cn } from "@/lib/utils";

export interface RpgChoice {
  label: string;
  // The caller closes the dialog (via onOpenChange) when a choice should close it.
  onSelect: () => void;
  disabled?: boolean;
}

interface RpgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  choices: RpgChoice[];
  // Radix's focus return on close; preventDefault() keeps focus where a choice moved it.
  onCloseAutoFocus?: (event: Event) => void;
  // Content between the description and the choices (a form, a loading or error line). It
  // scrolls inside when the dialog is taller than the screen.
  children?: React.ReactNode;
  // e.g. a wider box for a form.
  className?: string;
}

// The app's only dialog style (SPEC §3, §16.6): dark box, accent pixel border with the RPG box's
// gold corner pixels and offset shadow, cream text, and the RPG box's choices: one "▶" beside the
// hovered choice, else the focused one, else the first (rpg-box.css).
// Radix handles the focus trap, Escape to close, and focusing the first choice (or the first
// field of its content) on open.
export function RpgDialog({
  open,
  onOpenChange,
  title,
  description,
  choices,
  onCloseAutoFocus,
  children,
  className,
}: RpgDialogProps) {
  const [focused, setFocused] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(event: React.KeyboardEvent) {
    const last = choices.length - 1;
    const next = (
      {
        ArrowDown: focused === last ? 0 : focused + 1,
        ArrowUp: focused === 0 ? last : focused - 1,
        Home: 0,
        End: last,
      } as Record<string, number>
    )[event.key];
    if (next === undefined) return;
    event.preventDefault();
    buttons.current[next]?.focus();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        font="normal"
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
        // Centered with inset-0 + auto margins instead of the base dialog's translate(-50%, -50%),
        // which can land on half pixels and blur the pixel borders (fills bleed past them).
        className={cn(
          "inset-0 m-auto flex h-fit max-h-[calc(100dvh-2rem)] translate-x-0 translate-y-0 flex-col gap-6 bg-text p-6 text-background ring-0 drop-shadow-pixel sm:max-w-md *:aria-hidden:border-accent",
          className,
        )}
      >
        {/* The 8bit border's corners are notched; these sit in its inner corners, as on the RpgBox. */}
        <span aria-hidden="true" className="rpg-box-corner top-0 left-0" />
        <span aria-hidden="true" className="rpg-box-corner top-0 right-0" />
        <span aria-hidden="true" className="rpg-box-corner bottom-0 left-0" />
        <span aria-hidden="true" className="rpg-box-corner right-0 bottom-0" />
        <DialogTitle className="shrink-0 text-h3">{title}</DialogTitle>
        {description && (
          <DialogDescription className="shrink-0 text-body text-background">{description}</DialogDescription>
        )}
        {/* -m/p: fields' pixel borders sit 6px outside them, inside the scroll box's clip.
            scroll-py: a field scrolled into view by keyboard focus keeps its focus outline inside. */}
        {children && <div className="-m-1.5 min-h-0 scroll-py-3 overflow-y-auto p-1.5">{children}</div>}
        <ul className={cn(rpgChoices, "shrink-0")} onKeyDown={handleKeyDown}>
          {choices.map((choice, i) => (
            <li key={choice.label}>
              <button
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                type="button"
                onFocus={() => setFocused(i)}
                onClick={choice.onSelect}
                disabled={choice.disabled}
                className={cn(rpgChoice, "w-full text-left disabled:opacity-50")}
              >
                <ChoiceMarker />
                {choice.label}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
