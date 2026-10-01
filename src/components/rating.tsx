import { Star } from "pixelarticons/react/Star";

// A visit's rating (SPEC §14.3, §14.4): a star and "8/10".
export function Rating({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-1">
      <Star aria-hidden="true" className="size-6 shrink-0" />
      <span className="sr-only">Rating </span>
      {value}/10
    </span>
  );
}
