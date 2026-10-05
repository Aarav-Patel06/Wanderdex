import { PageBackground } from "@/components/page-background";

// A page outside the app shell (the root error and not-found pages): the cream background art
// (SPEC §16.7) behind one centered column, like the login page.
export function PlainPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageBackground phone="top" className="inset-x-0 top-[env(safe-area-inset-top)] bottom-[env(safe-area-inset-bottom)]" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">{children}</main>
    </>
  );
}
