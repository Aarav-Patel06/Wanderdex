import Link from "next/link";

import { ChoiceMarker, RpgBox, rpgChoice, rpgChoices } from "@/components/dialogs/rpg-box";

// No such place, one this user can't read, or none of their visits there (SPEC §14.4): an
// RPG box with the way back.
export default function PlaceNotFound() {
  return (
    <section className="px-4 pt-[calc(2rem+env(safe-area-inset-top))] pb-8 md:px-8 md:pt-8">
      <RpgBox className="max-w-md">
        <h1 className="text-h3">The trail goes cold here.</h1>
        <p>This place isn&apos;t in your Wanderdex, traveler.</p>
        <div className={rpgChoices}>
          <Link href="/visits" className={rpgChoice}>
            <ChoiceMarker />
            Back to My Visits
          </Link>
        </div>
      </RpgBox>
    </section>
  );
}
