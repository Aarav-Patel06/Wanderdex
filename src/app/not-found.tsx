import type { Metadata } from "next";
import Link from "next/link";

import { ChoiceMarker, RpgBox, rpgChoice, rpgChoices } from "@/components/dialogs/rpg-box";
import { PlainPage } from "@/components/plain-page";

export const metadata: Metadata = { title: "Not found · Wanderdex" };

// Any URL that isn't a page (SPEC §11.7), with the ways back. Logged-out visitors never get
// here: the proxy sends them to /login first.
export default function NotFound() {
  return (
    <PlainPage>
      <RpgBox>
        <h1 className="text-h3">The trail goes cold here.</h1>
        <nav aria-label="Ways back" className={rpgChoices}>
          <Link href="/" className={rpgChoice}>
            <ChoiceMarker />
            Overworld
          </Link>
          <Link href="/visits" className={rpgChoice}>
            <ChoiceMarker />
            My Visits
          </Link>
        </nav>
      </RpgBox>
    </PlainPage>
  );
}
