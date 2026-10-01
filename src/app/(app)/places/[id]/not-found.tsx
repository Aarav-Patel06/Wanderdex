import Link from "next/link";

// No such place, one this user can't read, or none of their visits there (SPEC §14.4): an
// RPG box (shell.css) with the way back. The shadow is on the wrapper, outside the notched box.
export default function PlaceNotFound() {
  return (
    <section className="px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-8 md:px-8 md:pt-8">
      <div className="max-w-md drop-shadow-pixel">
        <div className="rpg-box relative flex flex-col gap-4 border-6 border-accent bg-text p-4 text-background">
          <span aria-hidden="true" className="rpg-box-corner top-0 left-0" />
          <span aria-hidden="true" className="rpg-box-corner top-0 right-0" />
          <span aria-hidden="true" className="rpg-box-corner bottom-0 left-0" />
          <span aria-hidden="true" className="rpg-box-corner right-0 bottom-0" />
          <h1 className="text-h3">The trail goes cold here.</h1>
          <p>This place isn&apos;t in your Wanderdex, traveler.</p>
          <Link href="/visits" className="flex min-h-11 items-center gap-3 self-start font-display text-button">
            <span aria-hidden="true" className="text-accent">
              ▶︎
            </span>
            Back to My Visits
          </Link>
        </div>
      </div>
    </section>
  );
}
