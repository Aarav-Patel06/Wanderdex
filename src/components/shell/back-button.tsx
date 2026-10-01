"use client";

import { useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "pixelarticons/react/ArrowLeft";

import { Button } from "@/components/ui/8bit/button";

// Whether this tab has moved between app pages since it loaded. Browser history can't tell an
// in-app previous page from another site, so the shell records it instead.
let firstPath: string | null = null;
let navigated = false;

// Called by the app shell on every page.
export function useTrackNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    if (firstPath === null) firstPath = pathname;
    else if (pathname !== firstPath) navigated = true;
  }, [pathname]);
}

// Back to the previous app page, or to `fallback` when the app opened on this one (a shared link,
// a reload).
export function BackButton({ fallback, className }: { fallback: string; className?: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => (navigated ? router.back() : router.push(fallback))}
      className={className}
    >
      <ArrowLeft aria-hidden="true" className="size-6 shrink-0" />
      Back
    </Button>
  );
}
