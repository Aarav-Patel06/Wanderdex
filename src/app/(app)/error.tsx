"use client";

import { useEffect } from "react";

import { usePathname } from "next/navigation";

import { SpiritsError } from "@/components/dialogs/rpg-box";
import { AppPageBackground } from "@/components/shell/app-shell";
import { cn } from "@/lib/utils";

// An app page that failed to load (SPEC §11.7), inside the shell, so the sidebar and tab bar stay.
// Try again re-fetches and re-renders the page. On the Overworld's route the page is cream like
// the others, with their background art, and starts clear of the sidebar (desktop) and the avatar
// button (phones), which the map would otherwise run under.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const overworld = usePathname() === "/";
  useEffect(() => console.error(error), [error]);

  return (
    <section
      className={cn(
        "px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-8 md:px-8 md:pt-8",
        overworld && "pt-[calc(4.75rem+env(safe-area-inset-top))] md:pl-[calc(22rem+2rem)]",
      )}
    >
      {overworld && <AppPageBackground />}
      <SpiritsError heading onRetry={retry} />
    </section>
  );
}
