"use client";

import { useId } from "react";

import { ArrowLeft } from "pixelarticons/react/ArrowLeft";
import { Image as ImageIcon } from "pixelarticons/react/Image";
import { Link as LinkIcon } from "pixelarticons/react/Link";
import { Pencil } from "pixelarticons/react/Pencil";

import { Loading } from "@/components/loading";
import { Alert, AlertDescription } from "@/components/ui/8bit/alert";
import { Button } from "@/components/ui/8bit/button";
import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";
import { cn } from "@/lib/utils";

export type AddMode = "link" | "text";

const FIELDS = {
  link: {
    label: "Maps link",
    placeholder: "Paste a Google or Apple Maps link",
    maxLength: 2048,
    inputMode: "url",
  },
  text: {
    label: "Where did you go?",
    placeholder: "Ichiran Ramen in Shibuya, last March",
    maxLength: 500,
    inputMode: "text",
  },
} as const;

const MODES = [
  { mode: "link", label: "Paste Link", Icon: LinkIcon },
  { mode: "photo", label: "Upload Photo", Icon: ImageIcon },
  { mode: "text", label: "Type Location", Icon: Pencil },
] as const;

// The add panel's content (SPEC §11): three mode buttons and the chosen mode's input. Upload
// Photo is Phase 2, so it's shown but disabled. Two layouts, with the same state:
// - "grid" (the mobile drawer): the modes side by side, the chosen one's input below them.
// - "list" (the desktop speech bubble): the modes as a vertical menu with the RPG cursor (▶) on
//   the hovered or focused one; choosing one swaps the menu for its input, with a way back.
export function AddPanel({
  layout,
  mode,
  onMode,
  value,
  onValue,
  onFind,
  loading,
  error,
  inputRef,
}: {
  layout: "grid" | "list";
  mode: AddMode | null;
  onMode: (mode: AddMode | null) => void;
  value: string;
  onValue: (value: string) => void;
  onFind: () => void;
  loading: boolean;
  error: string | null;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const inputId = useId();
  const field = mode && FIELDS[mode];
  const list = layout === "list";

  return (
    <div className="flex flex-col gap-6">
      {list ? (
        !mode && (
          // The first mode takes focus as the bubble opens (and on the way back), so the cursor
          // starts on it, as in the RPG dialog.
          <ul role="group" aria-label="How to add" className="mode-list flex flex-col gap-6 py-1.5 pr-1.5">
            {MODES.map(({ mode: option, label, Icon }, index) => (
              <li key={option} className="mode-row flex items-center gap-3">
                <span aria-hidden="true" className="mode-cursor w-4 shrink-0 font-display text-button">
                  ▶︎
                </span>
                <ModeButton
                  pressed={false}
                  autoFocus={index === 0}
                  disabled={option === "photo" || loading}
                  onClick={option === "photo" ? undefined : () => onMode(option)}
                  className="min-h-11 flex-1 flex-row justify-start gap-2 px-4"
                >
                  <Icon aria-hidden="true" className="size-6 shrink-0" />
                  {label}
                </ModeButton>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div role="group" aria-label="How to add" className="grid grid-cols-3 gap-4 px-1.5">
          {MODES.map(({ mode: option, label, Icon }) => (
            <ModeButton
              key={option}
              pressed={mode === option}
              disabled={option === "photo" || loading}
              onClick={option === "photo" ? undefined : () => onMode(option)}
            >
              <Icon aria-hidden="true" className="size-6 shrink-0" />
              {label}
            </ModeButton>
          ))}
        </div>
      )}

      {field && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onFind();
          }}
          className="flex flex-col gap-2"
        >
          <Label htmlFor={inputId}>{field.label}</Label>
          <div className="flex items-center gap-4 px-1.5">
            <Input
              // A new input per mode, focused as the mode is picked.
              key={mode}
              ref={inputRef}
              id={inputId}
              autoFocus
              value={value}
              onChange={(event) => onValue(event.target.value)}
              placeholder={field.placeholder}
              maxLength={field.maxLength}
              inputMode={field.inputMode}
              enterKeyHint="search"
              autoComplete="off"
              autoCapitalize={mode === "link" ? "none" : "sentences"}
              autoCorrect={mode === "link" ? "off" : "on"}
              spellCheck={mode === "text"}
              disabled={loading}
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={loading || !value.trim()} className="mx-1.5 shrink-0">
              Find
            </Button>
          </div>
          {loading && <Loading className="mt-2" />}
          {error && (
            <Alert variant="error" className="mt-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </form>
      )}

      {list && mode && (
        <Button type="button" variant="ghost" disabled={loading} onClick={() => onMode(null)} className="gap-2 self-start px-0">
          <ArrowLeft aria-hidden="true" className="size-6 shrink-0" />
          Back
        </Button>
      )}
    </div>
  );
}

// Secondary pixel buttons; the chosen mode is accent with dark text (cream on primary only
// passes contrast for 16px+ Press Start 2P, SPEC §16.3). In the drawer's grid, the icon sits
// above the label; in the bubble's list, beside it.
function ModeButton({
  pressed,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { pressed: boolean }) {
  return (
    <Button
      type="button"
      variant="secondary"
      font="normal"
      aria-pressed={pressed}
      className={cn(
        "h-auto min-h-16 flex-col gap-1 px-2 py-2 font-body text-body whitespace-normal aria-pressed:bg-accent",
        className,
      )}
      {...props}
    />
  );
}
