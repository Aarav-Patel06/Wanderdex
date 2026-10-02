import { Star } from "pixelarticons/react/Star";

// A visit's rating (SPEC §14.3, §14.4): a star and "8/10", or "--" with none.
export function Rating({ value }: { value: number | null }) {
  return (
    <span className="flex items-center gap-1">
      <Star aria-hidden="true" className="size-6 shrink-0" />
      {value === null ? (
        <>
          <span className="sr-only">No rating</span>
          <span aria-hidden="true">--</span>
        </>
      ) : (
        <>
          <span className="sr-only">Rating </span>
          {value}/10
        </>
      )}
    </span>
  );
}
