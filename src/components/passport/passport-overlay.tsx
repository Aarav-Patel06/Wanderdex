"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "pixelarticons/react/ArrowRight";
import { ChevronLeft } from "pixelarticons/react/ChevronLeft";
import { ChevronRight } from "pixelarticons/react/ChevronRight";
import { Close } from "pixelarticons/react/Close";
import { Flag } from "pixelarticons/react/Flag";
import { Globe } from "pixelarticons/react/Globe";
import { Heart } from "pixelarticons/react/Heart";
import { Map as MapIcon } from "pixelarticons/react/Map";
import { Suitcase } from "pixelarticons/react/Suitcase";
import { Trophy } from "pixelarticons/react/Trophy";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

import { Loading } from "@/components/loading";
import type { PassportState } from "@/components/passport/use-passport-secret";
import { Button } from "@/components/ui/8bit/button";
import { DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { categorySprite } from "@/lib/categories";
import type { PassportData } from "@/lib/stats/passport";

import "./passport.css";

// Room for the open spread (two pages side by side); otherwise one page at a time.
const SPREAD = "(min-width: 840px) and (min-height: 640px)";

// The entry stamps' shapes and inks, in turn (passport.css).
const STAMP_SHAPES = ["round", "oct", "double", "oval"] as const;
const STAMP_INKS = ["primary", "ocean", "border"] as const;

// Foxing spots on each page, in the gap between the double border and the content (never under
// it): which side, how far along it (a fraction), and how big (px, at most the gap less 2px).
type Fox = { side: "top" | "right" | "bottom" | "left"; at: number; size: number };
const FOXING: Record<"first" | "second", Fox[]> = {
  first: [
    { side: "top", at: 0.8, size: 10 },
    { side: "left", at: 0.56, size: 8 },
    { side: "bottom", at: 0.3, size: 12 },
  ],
  second: [
    { side: "left", at: 0.1, size: 12 },
    { side: "right", at: 0.46, size: 8 },
    { side: "bottom", at: 0.64, size: 10 },
  ],
};

function subscribe(onChange: () => void) {
  const query = window.matchMedia(SPREAD);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Sparkles around the passport: a corner or edge of it (fractions of its width and height) plus
// an offset in sparkle pixels, each twinkling on its own beat (passport.css).
const SPARKLES = [
  { src: "sparkle_5", x: 0, y: 0, dx: -8, dy: -8, delay: 0 },
  { src: "sparkle_3", x: 0.36, y: 0, dx: 0, dy: -7, delay: 0.5 },
  { src: "sparkle_5", x: 1, y: 0.07, dx: 3, dy: 0, delay: 0.25 },
  { src: "sparkle_3", x: 1, y: 0.64, dx: 4, dy: 0, delay: 0.75 },
  { src: "sparkle_5", x: 0.8, y: 1, dx: 0, dy: 3, delay: 0.4 },
  { src: "sparkle_3", x: 0, y: 0.6, dx: -6, dy: 0, delay: 0.6 },
] as const;

// The passport secret (SPEC §15.1): the passport flips open, in steps, into a red leather book:
// a passport data page and the travels page. Side by side where there's room; otherwise one page
// at a time, turned with the arrows (passport.css). The one dialog not in the RPG style
// (SPEC §3). On the Radix Dialog: Escape, a click outside the passport, or the close button
// closes it; focus starts on the close button, stays inside, and goes back to the trigger.
// Loaded only once a trigger is first used.
export default function PassportOverlay({
  data,
  onClose,
  returnFocus,
}: {
  data: PassportState;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const spread = useSyncExternalStore(subscribe, () => window.matchMedia(SPREAD).matches, () => true);
  // One page at a time: the one showing.
  const [page, setPage] = useState<1 | 2>(1);
  const prev = useRef<HTMLButtonElement>(null);
  const next = useRef<HTMLButtonElement>(null);

  // Turning disables the arrow that was used, so focus moves to the other one (once enabled).
  function turn(to: 1 | 2) {
    const focused = document.activeElement;
    flushSync(() => setPage(to));
    if (focused === prev.current || focused === next.current) (to === 2 ? prev : next).current?.focus();
  }

  const first = (
    <section aria-label="Traveler" className="passport-sheet passport-first" inert={!spread && page !== 1}>
      <PageWear spots={FOXING.first} />
      <PageFrame />
      <DataPage data={data} />
    </section>
  );

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus();
          }}
          // It covers the window (so a short one can scroll it); a click anywhere but the book
          // and the controls is outside.
          onClick={(event) => {
            if (!(event.target as Element).closest(".passport-book, .passport-close, .passport-turn")) onClose();
          }}
          onKeyDown={(event) => {
            if (spread) return;
            if (event.key === "ArrowRight" && page === 1) turn(2);
            if (event.key === "ArrowLeft" && page === 2) turn(1);
          }}
          data-layout={spread ? "spread" : "single"}
          data-page={page}
          className="passport-dialog"
        >
          <DialogPrimitive.Title className="sr-only">Passport</DialogPrimitive.Title>
          <div className="passport-stage">
            {/* As the map's icon buttons; inset by its 4px pixel border, which sits outside it. */}
            <div className="passport-close">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="secondary" size="icon" aria-label="Close">
                  <Close aria-hidden="true" className="size-6" />
                </Button>
              </DialogPrimitive.Close>
            </div>

            <div className="passport">
              {SPARKLES.map(({ src, x, y, dx, dy, delay }) => (
                // eslint-disable-next-line @next/next/no-img-element -- a 3–5px sprite; next/image adds nothing
                <img
                  key={`${x},${y}`}
                  src={`/sprites/bg/${src}.png`}
                  alt=""
                  aria-hidden="true"
                  className={`passport-sparkle pixelated ${src}`}
                  style={{ "--x": x, "--y": y, "--dx": dx, "--dy": dy, "--beat": `${delay}s` } as React.CSSProperties}
                />
              ))}
              <div className="passport-book">
                {/* The back cover's board with the travels page (and, one page at a time, the
                    data page as a leaf over it), under the cover until it opens. */}
                <div className="passport-board passport-back">
                  <Leather />
                  <PageEdges />
                  <section aria-label="Your journey" className="passport-sheet passport-second" inert={!spread && page !== 2}>
                    <PageWear spots={FOXING.second} />
                    <PageFrame />
                    <TravelsPage data={data} onClose={onClose} />
                  </section>
                  {!spread && first}
                </div>
                {/* The cover turns on its spine; side by side, its inside is the front board
                    with the data page. */}
                <div className="passport-cover">
                  <div aria-hidden="true" className="passport-face passport-front">
                    <span className="passport-art">
                      {/* eslint-disable-next-line @next/next/no-img-element -- drawn inside a 3D transform at whole scales */}
                      <img src="/sprites/passport.png" alt="" className="pixelated" />
                      <span className="passport-shine" />
                    </span>
                  </div>
                  {spread && (
                    <div className="passport-face passport-board passport-inside">
                      <Leather />
                      <PageEdges />
                      {first}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!spread && (
              <div className="passport-turn">
                <Button
                  ref={prev}
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label="Previous page"
                  disabled={page === 1}
                  onClick={() => turn(1)}
                >
                  <ChevronLeft aria-hidden="true" className="size-6" />
                </Button>
                <p aria-live="polite" className="passport-page-no">
                  Page {page} of 2
                </p>
                <Button
                  ref={next}
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label="Next page"
                  disabled={page === 2}
                  onClick={() => turn(2)}
                >
                  <ChevronRight aria-hidden="true" className="size-6" />
                </Button>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

// A board's leather, scuffed.
function Leather() {
  return (
    <span aria-hidden="true" className="passport-leather">
      <span className="passport-scuffs" />
    </span>
  );
}

// The page edges stacked beside a page, a little uneven.
function PageEdges() {
  return (
    <span aria-hidden="true" className="passport-edges">
      <span />
      <span />
      <span />
    </span>
  );
}

// A page's wear: dithered texture, darker dithered edges and corners, and a few foxing spots.
function PageWear({ spots }: { spots: Fox[] }) {
  return (
    <span aria-hidden="true" className="passport-wear">
      <span className="passport-wear-edge" />
      {spots.map(({ side, at, size }) => (
        <span
          key={`${side},${at}`}
          data-side={side}
          className="passport-fox"
          style={{ "--at": at, "--size": `${size}px` } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

// A page's thin double border with a diamond on each corner.
function PageFrame() {
  return (
    <span aria-hidden="true" className="passport-frame">
      <Diamond className="passport-corner" />
      <Diamond className="passport-corner" />
      <Diamond className="passport-corner" />
      <Diamond className="passport-corner" />
    </span>
  );
}

function Diamond({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`passport-diamond ${className}`} />;
}

// The passport data page: the header band, the holder panel (photo and fields), the entry
// stamps over the security print (the world map and the airplane trail), and the
// machine-readable zone in its strip.
function DataPage({ data }: { data: PassportState }) {
  return (
    <div className="passport-content passport-data">
      <header className="passport-band">
        <Globe aria-hidden="true" className="passport-globe" />
        <div>
          <p className="passport-brand">WANDERDEX</p>
          <p className="passport-tagline">Collect places. Build your world.</p>
        </div>
      </header>
      {data === null ? (
        <PageLoading />
      ) : data === "error" ? (
        <p className="passport-error">The map spirits aren&apos;t answering. Try again.</p>
      ) : (
        <>
          <div className="passport-panel passport-holder">
            <div aria-hidden="true" className="passport-photo">
              <span>{data.name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="passport-holder-fields">
              <dl className="passport-codes">
                <Field label="Type" value="P" small />
                <Field label="Code" value={data.issuer} small />
                <Field label="Passport No." value={data.travelerNo} small />
              </dl>
              <dl className="passport-fields">
                {/* Press Start 2P fits 10 characters on a compact page, 13 on a roomy one; a longer
                    name is set in VT323 there, so it stays on one line. */}
                <Field label="Name" value={data.name} fit={data.name.length <= 10 ? "all" : data.name.length <= 13 ? "roomy" : "none"} />
                <Field label="Nationality" value="Wanderer" />
                <Field label="Issued" value={data.issued} />
              </dl>
            </div>
          </div>
          <section aria-labelledby="passport-entries" className="passport-entries">
            <h3 id="passport-entries" className="passport-section passport-label">
              Entry stamps
            </h3>
            <div className="passport-print">
              <span aria-hidden="true" className="passport-map pixelated" />
              <span aria-hidden="true" className="passport-trail pixelated" />
              {data.entries.length ? (
                <ul className="passport-entry-list">
                  {data.entries.map(({ code, date }, i) => (
                    <li
                      key={code}
                      data-shape={STAMP_SHAPES[i % STAMP_SHAPES.length]}
                      data-ink={STAMP_INKS[i % STAMP_INKS.length]}
                      className="passport-entry"
                    >
                      <span className="passport-entry-code">{code}</span>
                      <span className="passport-entry-date">{date}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="passport-entry-none">No stamps yet. Your first country goes here.</p>
              )}
            </div>
          </section>
          <div aria-hidden="true" className="passport-mrz-strip">
            <p className="passport-mrz">
              {data.mrz[0]}
              <br />
              {data.mrz[1]}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  small = false,
  fit,
}: {
  label: string;
  value: string;
  small?: boolean;
  fit?: "all" | "roomy" | "none";
}) {
  return (
    <div>
      <dt className="passport-label">{label}</dt>
      <dd data-fit={fit} className={small ? "passport-code" : "passport-field"}>
        {value}
      </dd>
    </div>
  );
}

// The travels page: a ribbon across the top border, then the numbers as rows, and a footer with
// the compass. On an error the data page says so, and this one shows only its heading.
function TravelsPage({ data, onClose }: { data: PassportState; onClose: () => void }) {
  return (
    <div className="passport-content passport-travels">
      <header className="passport-heading">
        {/* On the top border line, which stops at the diamonds on either side. */}
        <Diamond className="passport-ribbon-cap" />
        <p className="passport-ribbon">
          <span>SECRET MODE</span>
        </p>
        <Diamond className="passport-ribbon-cap" />
        <p className="passport-subtitle">Your journey</p>
      </header>
      {data === null ? <PageLoading /> : data === "error" ? null : <Travels data={data} onClose={onClose} />}
      <footer className="passport-footer">
        <span>Same world. More to explore.</span>
        <Image src="/sprites/airplane.png" alt="" aria-hidden="true" width={48} height={18} unoptimized className="pixelated" />
        <span aria-hidden="true" className="passport-compass pixelated" />
      </footer>
    </div>
  );
}

function Travels({ data, onClose }: { data: PassportData; onClose: () => void }) {
  const { countries, continents, favorite, topRated, firstPin } = data;
  const continentsVisited = continents.filter((continent) => continent.visited).length;

  return (
    <div className="passport-panel passport-rows">
      <Row icon={<Globe />} label="Countries">
        <span className="passport-number">
          {countries.visited}/{countries.total}
        </span>
        <span
          aria-hidden="true"
          className="passport-bar"
          style={{ "--share": countries.visited / countries.total } as React.CSSProperties}
        >
          <span />
        </span>
      </Row>
      <Row icon={<MapIcon />} label={`Continents ${continentsVisited}/${continents.length}`}>
        <ul className="passport-stamps">
          {continents.map(({ code, name, visited }) => (
            <li key={code} data-visited={visited || undefined}>
              <span aria-hidden="true">{code}</span>
              <span className="sr-only">
                {name}, {visited ? "visited" : "not visited"}
              </span>
            </li>
          ))}
        </ul>
      </Row>
      <Row icon={<Sprite src="/sprites/pin_group.png" />} label="Pins">
        <span className="passport-number">{data.pins}</span>
      </Row>
      <Row icon={<Suitcase />} label="Total visits">
        <span className="passport-number">{data.visits}</span>
      </Row>
      <Row icon={<Sprite src="/sprites/pin_city.png" />} label="Cities">
        <span className="passport-number">{data.cities}</span>
      </Row>
      <Row icon={favorite ? <Sprite src={categorySprite(favorite.category)} /> : <Heart />} label="Favorite category">
        <span className="passport-text">{favorite?.label ?? "--"}</span>
      </Row>
      <Row icon={<Trophy />} label="Highest rated">
        {topRated ? (
          <>
            <span className="passport-text truncate">{topRated.name}</span>
            <span className="passport-text shrink-0">({topRated.rating}/10)</span>
          </>
        ) : (
          <span className="passport-text">--</span>
        )}
      </Row>
      {firstPin ? (
        // The whole row links to the place; going there closes the passport.
        <div className="passport-row">
          <Link href={`/places/${firstPin.id}`} onClick={onClose} className="passport-row-link">
            <span aria-hidden="true" className="passport-icon">
              <Flag />
            </span>
            <span className="passport-row-body">
              <span className="passport-label">First pin · {firstPin.date}</span>
              <span className="passport-value">
                <span className="passport-text truncate">{firstPin.name}</span>
              </span>
            </span>
            <ArrowRight aria-hidden="true" className="size-6 shrink-0" />
          </Link>
        </div>
      ) : (
        <Row icon={<Flag />} label="First pin">
          <span className="passport-text">--</span>
        </Row>
      )}
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="passport-row">
      <span aria-hidden="true" className="passport-icon">
        {icon}
      </span>
      <span className="passport-row-body">
        <span className="passport-label">{label}</span>
        <span className="passport-value">{children}</span>
      </span>
    </div>
  );
}

function Sprite({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a 1× sprite
  return <img src={src} alt="" className="pixelated" width={32} height={32} />;
}

// The shared loading dots, in the body font so "Loading..." fits a phone's page.
function PageLoading() {
  return <Loading className="passport-loading font-body text-body" />;
}
