import type { Metadata } from "next";

export const metadata: Metadata = { title: "Place · Wanderdex" };

// Placeholder. Place detail (SPEC §14.4) replaces this.
export default function PlacePage() {
  return (
    <section className="flex flex-col gap-4 px-4 py-8 md:px-8">
      <h1>Place</h1>
      <p>Place details are on their way.</p>
    </section>
  );
}
