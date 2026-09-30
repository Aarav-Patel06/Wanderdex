import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { Toaster } from "@/components/ui/sonner";
import "@/styles/globals.css";

// Committed font files (with their OFL licenses) so dev and builds never need Google.
const pressStart = localFont({
  src: "../styles/fonts/press-start-2p/PressStart2P-Regular.ttf",
  weight: "400",
  variable: "--font-press-start",
});

const vt323 = localFont({
  src: "../styles/fonts/vt323/VT323-Regular.ttf",
  weight: "400",
  variable: "--font-vt323",
});

export const metadata: Metadata = {
  title: "Wanderdex",
  description: "Collect places. Build your world.",
};

// cover: the page runs to the screen edges, so the mobile tab bar's fill reaches the
// bottom. Anything near an edge pads itself with env(safe-area-inset-*).
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${pressStart.variable} ${vt323.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
