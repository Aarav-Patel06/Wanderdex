"use client";

import { Close } from "pixelarticons/react/Close";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Loading } from "@/components/loading";
import type { PassportState } from "@/components/passport/use-passport-secret";
import { Button } from "@/components/ui/8bit/button";
import { DialogOverlay, DialogPortal } from "@/components/ui/dialog";

import "./passport.css";

// Sparkles around the spread, in sprite pixels (--s) from its top-left corner, each twinkling on
// its own beat (passport.css).
const SPARKLES = [
  { src: "sparkle_5", x: -5, y: -4, delay: 0 },
  { src: "sparkle_3", x: 18, y: -6, delay: 0.5 },
  { src: "sparkle_5", x: 51, y: 2, delay: 0.25 },
  { src: "sparkle_3", x: 52, y: 18, delay: 0.75 },
  { src: "sparkle_5", x: 40, y: 30, delay: 0.4 },
  { src: "sparkle_3", x: -4, y: 24, delay: 0.6 },
] as const;

// The passport secret (SPEC §15.1): the passport flips open, in steps, into a two-page spread
// with the profile's numbers. The one dialog not in the RPG style (SPEC §3). On the Radix Dialog:
// Escape, a click outside the spread, or the close button closes it; focus starts on the close
// button, stays inside, and goes back to the trigger. Loaded only once a trigger is first used.
export default function PassportOverlay({
  data,
  onClose,
  returnFocus,
}: {
  data: PassportState;
  onClose: () => void;
  returnFocus: () => void;
}) {
  return (
    <DialogPrimitive.Root open onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus();
          }}
          className="passport-dialog"
        >
          <DialogPrimitive.Title className="sr-only">Passport</DialogPrimitive.Title>
          {/* As the map's icon buttons; inset by its 4px pixel border, which sits outside it. */}
          <div className="absolute top-1 right-1">
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="secondary" size="icon" aria-label="Close">
                <Close aria-hidden="true" className="size-6" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="passport">
            {SPARKLES.map(({ src, x, y, delay }) => (
              // eslint-disable-next-line @next/next/no-img-element -- a 3–5px sprite; next/image adds nothing
              <img
                key={`${x},${y}`}
                src={`/sprites/bg/${src}.png`}
                alt=""
                aria-hidden="true"
                className={`passport-sparkle pixelated ${src}`}
                style={{ "--x": x, "--y": y, "--beat": `${delay}s` } as React.CSSProperties}
              />
            ))}
            <div className="passport-book">
              {/* The right-hand page, under the cover until it opens. */}
              <section aria-label="Pins" className="passport-sheet passport-right">
                <RightPage data={data} />
              </section>
              {/* The cover turns on its spine (its left edge); its inside is the left-hand page. */}
              <div className="passport-cover">
                <div aria-hidden="true" className="passport-face passport-front">
                  {/* eslint-disable-next-line @next/next/no-img-element -- drawn inside a 3D transform at a whole scale */}
                  <img src="/sprites/passport.png" alt="" className="pixelated" />
                  <span className="passport-shine" />
                </div>
                <section aria-label="Countries" className="passport-face passport-sheet passport-back">
                  <LeftPage data={data} />
                </section>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

function LeftPage({ data }: { data: PassportState }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a whole-scale sprite under the text */}
      <img src="/sprites/bg/passport_stamp.png" alt="" aria-hidden="true" className="passport-stamp pixelated" />
      {data === null ? (
        <PageLoading />
      ) : data === "error" ? (
        <p className="relative text-tiny md:text-small">The map spirits aren&apos;t answering. Try again.</p>
      ) : (
        <dl className="passport-stats">
          <Stat label="Countries" value={data.countries} />
          <Stat label="Continents" value={data.continents} />
        </dl>
      )}
    </>
  );
}

function RightPage({ data }: { data: PassportState }) {
  if (data === null) return <PageLoading />;
  if (data === "error") return null;
  return (
    <dl className="passport-stats">
      <Stat label="Pins" value={String(data.pins)} />
      <div>
        <dt className="text-tiny md:text-small">First pin</dt>
        {data.firstPin ? (
          <dd className="text-tiny md:text-body">
            <span className="line-clamp-2 [overflow-wrap:anywhere]">{data.firstPin.name}</span>
            <span className="block">{data.firstPin.date}</span>
          </dd>
        ) : (
          <dd className="font-display text-h3 md:text-h2">--</dd>
        )}
      </div>
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-tiny md:text-small">{label}</dt>
      <dd className="font-display text-h3 md:text-h2">{value}</dd>
    </div>
  );
}

// The shared loading dots, in the body font so "Loading..." fits a phone's page.
function PageLoading() {
  return <Loading className="relative font-body text-body" />;
}
