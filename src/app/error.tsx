"use client";

import { useEffect } from "react";

import { SpiritsError } from "@/components/dialogs/rpg-box";
import { PlainPage } from "@/components/plain-page";

// A failure outside the app pages' own boundary ((app)/error.tsx): the app layout itself (its
// session or profile read) or the login and signup pages (SPEC §11.7). Try again re-fetches and
// re-renders.
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);

  return (
    <PlainPage>
      <SpiritsError heading onRetry={retry} />
    </PlainPage>
  );
}
