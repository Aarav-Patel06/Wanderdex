"use client";

import Image from "next/image";

import { usePassportSecret } from "@/components/passport/use-passport-secret";
import type { PassportData } from "@/lib/stats/passport";

// The profile header's passport (SPEC §14.6): 2×, 3× from md, and the passport secret's trigger
// on every device (SPEC §15.1). The page already has the numbers.
export function ProfilePassport({ data }: { data: PassportData }) {
  const passport = usePassportSecret({ data });
  return (
    <>
      <button type="button" aria-label="Passport" className="shrink-0" {...passport.triggerProps}>
        <Image
          src="/sprites/passport.png"
          alt=""
          width={96}
          height={96}
          unoptimized
          className="pixelated size-16 md:size-24"
          {...passport.spriteProps}
        />
      </button>
      {passport.overlay}
    </>
  );
}
