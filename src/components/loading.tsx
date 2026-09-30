import { cn } from "@/lib/utils";

import "./loading.css";

// The one loading indicator: "Loading" plus dots that cycle . → .. → ... in steps (static
// "..." with reduced motion). Takes the surrounding text color.
export function Loading({ className }: { className?: string }) {
  return (
    <p role="status" className={cn("font-display text-button", className)}>
      Loading
      <span aria-hidden="true" className="loading-dots">
        <span>...</span>
      </span>
    </p>
  );
}
