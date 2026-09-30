"use client";

import { useId } from "react";

import { Image as ImageIcon } from "pixelarticons/react/Image";
import { Link as LinkIcon } from "pixelarticons/react/Link";
import { Pencil } from "pixelarticons/react/Pencil";

import { Loading } from "@/components/loading";
import { Alert, AlertDescription } from "@/components/ui/8bit/alert";
import { Button } from "@/components/ui/8bit/button";
import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";

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

// The add panel's content (SPEC §11): three mode buttons, then the chosen mode's input. Upload
// Photo is Phase 2, so it's shown but disabled. The desktop dock and the mobile drawer both
// render this, with the same state.
export function AddPanel({
  mode,
  onMode,
  value,
  onValue,
  onFind,
  loading,
  error,
  inputRef,
  firstModeRef,
}: {
  mode: AddMode | null;
  onMode: (mode: AddMode) => void;
  value: string;
  onValue: (value: string) => void;
  onFind: () => void;
  loading: boolean;
  error: string | null;
  inputRef?: React.Ref<HTMLInputElement>;
  firstModeRef?: React.Ref<HTMLButtonElement>;
}) {
  const inputId = useId();
  const field = mode && FIELDS[mode];

  return (
    <div className="flex flex-col gap-6">
      <div role="group" aria-label="How to add" className="grid grid-cols-3 gap-4 px-1.5">
        <ModeButton ref={firstModeRef} pressed={mode === "link"} disabled={loading} onClick={() => onMode("link")}>
          <LinkIcon aria-hidden="true" className="size-6 shrink-0" />
          Paste Link
        </ModeButton>
        <ModeButton pressed={false} disabled>
          <ImageIcon aria-hidden="true" className="size-6 shrink-0" />
          Upload Photo
        </ModeButton>
        <ModeButton pressed={mode === "text"} disabled={loading} onClick={() => onMode("text")}>
          <Pencil aria-hidden="true" className="size-6 shrink-0" />
          Type Location
        </ModeButton>
      </div>

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
    </div>
  );
}

// Secondary pixel buttons; the chosen mode is accent with dark text (cream on primary only
// passes contrast for 16px+ Press Start 2P, SPEC §16.3). Icon above the label on phones,
// beside it on desktop, where the dock should stay short.
function ModeButton({
  pressed,
  ...props
}: React.ComponentProps<typeof Button> & { pressed: boolean }) {
  return (
    <Button
      type="button"
      variant="secondary"
      font="normal"
      aria-pressed={pressed}
      className="h-auto min-h-16 flex-col gap-1 px-2 py-2 font-body text-body whitespace-normal aria-pressed:bg-accent md:min-h-11 md:flex-row md:gap-2"
      {...props}
    />
  );
}
