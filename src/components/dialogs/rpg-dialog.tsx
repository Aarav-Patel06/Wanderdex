"use client";

import { useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/8bit/dialog";

export interface RpgChoice {
  label: string;
  // The caller closes the dialog (via onOpenChange) when a choice should close it.
  onSelect: () => void;
}

interface RpgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  choices: RpgChoice[];
}

// The app's only dialog style (SPEC §3, §16.6): dark box, accent pixel border,
// cream text, vertical choices with "▶" next to the focused one.
// Radix handles the focus trap, Escape to close, and focusing the first choice on open.
export function RpgDialog({ open, onOpenChange, title, description, choices }: RpgDialogProps) {
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
        className="gap-6 bg-text p-6 text-background ring-0 sm:max-w-md *:aria-hidden:border-accent"
      >
        <DialogTitle className="text-h3">{title}</DialogTitle>
        {description && (
          <DialogDescription className="text-body text-background">{description}</DialogDescription>
        )}
        <ul className="flex flex-col gap-1" onKeyDown={handleKeyDown}>
          {choices.map((choice, i) => (
            <li key={choice.label}>
              <button
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                type="button"
                onFocus={() => setFocused(i)}
                onClick={choice.onSelect}
                className="retro flex min-h-11 w-full items-center gap-3 text-left text-button"
              >
                <span aria-hidden="true" className="w-4 text-accent">
                  {focused === i ? "▶︎" : ""}
                </span>
                {choice.label}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
