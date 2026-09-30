import type { Metadata } from "next";

export const metadata: Metadata = { title: "Overworld · Wanderdex" };

// Placeholder. The map (SPEC §13) replaces this.
export default function OverworldPage() {
  return (
    <section className="flex min-h-full flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <h1>Overworld</h1>
      <p>The map is on its way.</p>
    </section>
  );
}
