import type { Metadata } from "next";

export const metadata: Metadata = { title: "My Visits · Wanderdex" };

// Placeholder. The visits list (SPEC §14.3) replaces this.
export default function VisitsPage() {
  return (
    <section className="flex flex-col gap-4 px-4 py-8 md:px-8">
      <h1>My Visits</h1>
      <p>Your visits will show up here.</p>
    </section>
  );
}
