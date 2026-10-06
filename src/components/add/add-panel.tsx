"use client";

import { useId, useRef, useState } from "react";

import { ArrowLeft } from "pixelarticons/react/ArrowLeft";
import { Image as ImageIcon } from "pixelarticons/react/Image";
import { Images } from "pixelarticons/react/Images";
import { Link as LinkIcon } from "pixelarticons/react/Link";
import { MapPin } from "pixelarticons/react/MapPin";
import { Pencil } from "pixelarticons/react/Pencil";

import { Loading } from "@/components/loading";
import { Alert, AlertDescription } from "@/components/ui/8bit/alert";
import { Button } from "@/components/ui/8bit/button";
import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";
import { TRIP_PHOTOS_ENABLED } from "@/lib/trip/config";
import { cn } from "@/lib/utils";

export type AddMode = "link" | "text" | "photo" | "trip";
export type TextMode = "link" | "text";

export const isTextMode = (mode: AddMode | null): mode is TextMode => mode === "link" || mode === "text";

// What shows under the mode's input: an error (with "Drop a pin" for no results, SPEC §11.7),
// or the warning for a photo without GPS, which switched to Type Location (SPEC §11.2 step 3).
export type PanelMessage = { kind: "error"; text: string; dropPin?: boolean } | { kind: "no_location" };

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

// Trip Photos only in development builds until it's finished (lib/trip/config).
const MODES = [
  { mode: "link", label: "Paste Link", Icon: LinkIcon },
  { mode: "photo", label: "Upload Photo", Icon: ImageIcon },
  { mode: "text", label: "Type Location", Icon: Pencil },
  ...(TRIP_PHOTOS_ENABLED ? [{ mode: "trip", label: "Trip Photos", Icon: Images } as const] : []),
] as const;

// The add panel's content (SPEC §11): the mode buttons and the chosen mode's input, then
// "Can't find it? Drop a pin" (SPEC §11.4). Two layouts, with the same state:
// - "grid" (the mobile drawer): the modes in a grid (three across, or 2×2 with four, since four
//   don't fit across 375px, SPEC §14.2), the chosen one's input below them.
// - "list" (the desktop speech bubble): the modes as a vertical menu with the RPG cursor (▶) on
//   the hovered or focused one; choosing one swaps the menu for its input, with a way back.
//   Upload Photo and Trip Photos also take dropped files there.
// photoDate: the date of a photo without GPS, carried into Type Location.
// tripProgress: photos read so far while Trip Photos reads them.
export function AddPanel({
  layout,
  mode,
  onMode,
  value,
  onValue,
  onFind,
  onPhoto,
  onPhotos,
  onDropPin,
  loading,
  message,
  photoDate,
  tripProgress,
  inputRef,
}: {
  layout: "grid" | "list";
  mode: AddMode | null;
  onMode: (mode: AddMode | null) => void;
  value: string;
  onValue: (value: string) => void;
  onFind: () => void;
  onPhoto: (file: File) => void;
  onPhotos: (files: File[]) => void;
  onDropPin: () => void;
  loading: boolean;
  message: PanelMessage | null;
  photoDate: string | null;
  tripProgress: { done: number; total: number } | null;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const inputId = useId();
  const field = isTextMode(mode) && FIELDS[mode];
  const list = layout === "list";
  const dropPinInMessage = message?.kind === "error" && message.dropPin;

  return (
    // In the drawer's grid, Upload Photo's "Choose photo" sits right under the mode buttons, so
    // the rows are a button group apart (SPEC §16.5 rule 7).
    <div className={cn("flex flex-col", list ? "gap-6" : "gap-button-group")}>
      {list ? (
        !mode && (
          // The first mode takes focus as the bubble opens (and on the way back), so the cursor
          // starts on it, as in the RPG dialog.
          <ul role="group" aria-label="How to add" className="mode-list flex flex-col gap-button-group py-1.5 pr-1.5">
            {MODES.map(({ mode: option, label, Icon }, index) => (
              <li key={option} className="mode-row flex items-center gap-3">
                <span aria-hidden="true" className="mode-cursor w-4 shrink-0 font-display text-button">
                  ▶︎
                </span>
                <ModeButton
                  pressed={false}
                  autoFocus={index === 0}
                  disabled={loading}
                  onClick={() => onMode(option)}
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
        <div
          role="group"
          aria-label="How to add"
          className={cn("grid gap-button-group px-1.5", MODES.length === 4 ? "grid-cols-2" : "grid-cols-3")}
        >
          {MODES.map(({ mode: option, label, Icon }) => (
            <ModeButton key={option} pressed={mode === option} disabled={loading} onClick={() => onMode(option)}>
              <Icon aria-hidden="true" className="size-6 shrink-0" />
              {label}
            </ModeButton>
          ))}
        </div>
      )}

      {mode && (
        <div className="flex flex-col gap-2">
          {field ? (
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
              {mode === "text" && photoDate && <p className="text-tiny">Date from the photo: {photoDate}</p>}
            </form>
          ) : (
            <PhotoPicker
              dropZone={list}
              multiple={mode === "trip"}
              onFiles={mode === "trip" ? onPhotos : (files) => onPhoto(files[0])}
              disabled={loading}
            />
          )}
          {loading &&
            (tripProgress ? (
              <p role="status" className="mt-2">
                Reading photos {tripProgress.done}/{tripProgress.total}
              </p>
            ) : (
              <Loading className="mt-2" />
            ))}
          {message?.kind === "error" && (
            <Alert variant="error" className="mt-2">
              <AlertDescription>
                {message.text}
                {message.dropPin && (
                  <Button type="button" variant="secondary" onClick={onDropPin} className="mx-1.5 my-2">
                    Drop a pin
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {message?.kind === "no_location" && (
            <Alert variant="warning" className="mt-2">
              <AlertDescription>
                <span>
                  This photo has no location data.
                  <br />
                  Type where it was taken instead.
                </span>
              </AlertDescription>
            </Alert>
          )}
          {!dropPinInMessage && <DropPinLink onClick={onDropPin} disabled={loading} className="self-start" />}
        </div>
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

// "Can't find it? Drop a pin" (SPEC §11.4, §11.5): a ghost link in VT323, which fits beside other
// content where the 16px pixel font wouldn't.
export function DropPinLink({
  onClick,
  disabled,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      font="normal"
      disabled={disabled}
      onClick={onClick}
      className={cn("h-auto min-h-11 gap-1.5 px-0 font-body text-small whitespace-nowrap", className)}
    >
      <MapPin aria-hidden="true" className="size-6 shrink-0" />
      Can&apos;t find it? Drop a pin
    </Button>
  );
}

// Upload Photo (SPEC §11.2 step 1): one image from the device's normal picker. image/* opens the
// photo library on phones; the type is checked once a file is picked. In the desktop bubble the
// box also takes a dropped file. The photo is read in the browser and never uploaded.
// Trip Photos (`multiple`, SPEC §11.8 step 1): the same, with many photos at once.
function PhotoPicker({
  dropZone,
  multiple,
  onFiles,
  disabled,
}: {
  dropZone: boolean;
  multiple: boolean;
  onFiles: (files: File[]) => void;
  disabled: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // On a task of its own: for hundreds of files, the pick is already a long task for the
  // browser (building the FileList), so nothing of ours is added to it.
  function take(files: FileList | null) {
    if (!files?.length || disabled) return;
    const picked = Array.from(files);
    setTimeout(() => onFiles(picked));
  }

  const dropHandlers = dropZone && {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      setOver(true);
    },
    // Moving onto a child also fires dragleave; only leaving the box counts.
    onDragLeave: (event: React.DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setOver(false);
      take(event.dataTransfer.files);
    },
  };

  return (
    <div
      {...dropHandlers}
      data-over={over || undefined}
      className={cn(
        "flex flex-col gap-3",
        dropZone ? "items-center border-4 border-dashed border-text p-4 text-center data-over:bg-accent" : "px-1.5",
      )}
    >
      {dropZone && <p>{multiple ? "Drop photos here, or" : "Drop a photo here, or"}</p>}
      <Button
        type="button"
        autoFocus
        disabled={disabled}
        onClick={() => fileInput.current?.click()}
        className={cn("mx-1.5", !dropZone && "self-start")}
      >
        {multiple ? "Choose photos" : "Choose photo"}
      </Button>
      {/* Visually hidden rather than display: none, which some mobile browsers won't open a
          picker for. Reset after each pick, so picking the same file again still works. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple={multiple}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
      <p className="text-tiny">
        {multiple
          ? "The photos stay on your device. Only their locations and dates are used."
          : "The photo stays on your device. Only its location and date are used."}
      </p>
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
