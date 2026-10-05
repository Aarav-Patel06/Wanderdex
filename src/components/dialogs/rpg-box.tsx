import { cn } from "@/lib/utils";

// The box styles (.rpg-box, notched corners) live with the shell's; pages outside the shell
// (the root error and not-found pages) need them too.
import "@/components/shell/shell.css";
import "./rpg-box.css";

// An RPG-style message box in the page, not a modal (SPEC §16.6): the dark notched box with the
// accent border and gold corner pixels. The shadow is on the wrapper, outside the notched box.
export function RpgBox({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div {...props} className={cn("drop-shadow-pixel", className)}>
      <div className="rpg-box relative flex flex-col gap-4 border-6 border-accent bg-text p-4 text-background">
        <span aria-hidden="true" className="rpg-box-corner top-0 left-0" />
        <span aria-hidden="true" className="rpg-box-corner top-0 right-0" />
        <span aria-hidden="true" className="rpg-box-corner bottom-0 left-0" />
        <span aria-hidden="true" className="rpg-box-corner right-0 bottom-0" />
        {children}
      </div>
    </div>
  );
}

// The box's choices (buttons or links), in a column. One "▶" shows at a time (rpg-box.css): on the
// hovered choice, else the keyboard-focused one, else the first.
export const rpgChoices = "rpg-choices flex flex-col gap-1";

// A choice: pixel text after its ChoiceMarker, 44px tall.
export const rpgChoice = "rpg-choice flex min-h-11 items-center gap-3 self-start font-display text-button";

export function ChoiceMarker() {
  return (
    <span aria-hidden="true" className="rpg-choice-marker text-accent">
      ▶︎
    </span>
  );
}

// "The map spirits aren't answering. Try again." (SPEC §11.7) with a Try again choice: the map
// that didn't load, and the error pages. `heading`: the page's h1 (error pages), or plain text
// over the map.
export function SpiritsError({ onRetry, heading = false }: { onRetry: () => void; heading?: boolean }) {
  const Title = heading ? "h1" : "p";
  return (
    <RpgBox role="alert" className="w-full max-w-md">
      <Title className="font-display text-h3">The map spirits aren&apos;t answering. Try again.</Title>
      <div className={rpgChoices}>
        <button type="button" onClick={onRetry} className={rpgChoice}>
          <ChoiceMarker />
          Try again
        </button>
      </div>
    </RpgBox>
  );
}
