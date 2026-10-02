import Image from "next/image";

import { cn } from "@/lib/utils";

import "./page-background.css";

type Corner = "tl" | "tr" | "bl" | "br";
type Layout = "full" | "top" | "bottom";

// One piece of background art: its sprite (public/sprites/bg/, native size), the corner it's
// anchored to, and its offset from that corner's two edges, in sprite pixels. `in`: the layouts
// that show it (page-background.css): "full" is docs/design/background-composite.png, offsets
// as measured there; "top" and "bottom" are the phone layouts, a few small pieces in the top or
// bottom corners.
type Piece = { name: string; w: number; h: number; corner: Corner; x: number; y: number; in: Layout[] };

const SPARKLE_3 = { name: "sparkle_3", w: 3, h: 3 };
const SPARKLE_5 = { name: "sparkle_5", w: 5, h: 5 };
const COMPASS = { name: "compass", w: 60, h: 60 };
const STAMP = { name: "passport_stamp", w: 66, h: 48 };

const PIECES: Piece[] = [
  { name: "map_fragment_americas", w: 150, h: 136, corner: "tl", x: -14, y: -4, in: ["full"] },
  { ...SPARKLE_3, corner: "tl", x: 115, y: 6, in: ["full"] },
  { ...SPARKLE_5, corner: "tl", x: 84, y: 43, in: ["full"] },
  { ...SPARKLE_3, corner: "tl", x: 75, y: 52, in: ["full"] },
  { ...SPARKLE_5, corner: "tl", x: 4, y: 93, in: ["full"] },
  { ...SPARKLE_3, corner: "tl", x: 5, y: 104, in: ["full"] },

  { ...COMPASS, corner: "bl", x: 8, y: 18, in: ["full", "bottom"] },
  { ...SPARKLE_5, corner: "bl", x: 15, y: 89, in: ["full", "bottom"] },
  { ...SPARKLE_3, corner: "bl", x: 24, y: 83, in: ["full", "bottom"] },
  { ...SPARKLE_5, corner: "bl", x: 83, y: 33, in: ["full"] },
  { ...SPARKLE_3, corner: "bl", x: 64, y: 17, in: ["full"] },
  { ...SPARKLE_3, corner: "bl", x: 70, y: 11, in: ["full"] },

  { name: "airplane_trail", w: 104, h: 46, corner: "tr", x: 15, y: 14, in: ["full"] },
  { ...SPARKLE_5, corner: "tr", x: 53, y: 10, in: ["full"] },
  { ...SPARKLE_3, corner: "tr", x: 46, y: 19, in: ["full"] },
  { ...SPARKLE_5, corner: "tr", x: 19, y: 51, in: ["full"] },
  { ...SPARKLE_5, corner: "tr", x: 9, y: 67, in: ["full"] },

  // Bottom-anchored with the stamp, which overlaps Australia in the composite.
  { name: "map_fragment_asia_pacific", w: 120, h: 112, corner: "br", x: -3, y: 52, in: ["full"] },
  { ...STAMP, corner: "br", x: 3, y: 12, in: ["full", "bottom"] },
  { ...SPARKLE_5, corner: "br", x: 102, y: 45, in: ["full", "bottom"] },
  { ...SPARKLE_3, corner: "br", x: 80, y: 15, in: ["full"] },

  // Phones, top corners: either side of a centered logo.
  { ...COMPASS, corner: "tl", x: 8, y: 10, in: ["top"] },
  { ...SPARKLE_3, corner: "tl", x: 66, y: 8, in: ["top"] },
  { ...STAMP, corner: "tr", x: 3, y: 14, in: ["top"] },
  { ...SPARKLE_5, corner: "tr", x: 40, y: 68, in: ["top"] },
];

// The faint map art behind the plain cream pages (login, signup, My Visits, place detail): a
// fixed layer behind the content that never scrolls, takes no clicks, and never widens the page.
// page-background.css picks the whole-number scale and the layout from the layer's own size.
// `phone`: which corners the phone layout uses, the ones the page's text leaves free.
export function PageBackground({ phone, className }: { phone: "top" | "bottom"; className?: string }) {
  return (
    <div aria-hidden="true" data-phone={phone} className={cn("page-background", className)}>
      <div className="page-background-art">
        {PIECES.map(({ name, w, h, corner, x, y, in: layouts }, index) => (
          <Image
            key={index}
            src={`/sprites/bg/${name}.png`}
            alt=""
            width={w}
            height={h}
            unoptimized
            data-corner={corner}
            data-in={layouts.join(" ")}
            style={{ "--w": w, "--x": x, "--y": y } as React.CSSProperties}
            className="pixelated"
          />
        ))}
      </div>
    </div>
  );
}
