"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

// No dark mode (SPEC §1.2), so next-themes and sonner's icon set are not used.
// Toasts are rendered by the 8bit toast() in components/ui/8bit/toast.tsx.
// expand: a save can show two toasts (SPEC §11.6), and both should be readable.
// mobileOffset (sonner's layout below 600px): level with the Overworld's avatar button and
// left of it, so toasts cover neither it nor the map controls under it, and they're far from
// the tab bar at the bottom. The 6px is the toast's pixel border, drawn outside it; the right
// offset clears the 44px avatar, its 4px shadow, and a 12px gap. The width rule that goes
// with it is in globals.css.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-center"
      duration={4000}
      expand
      mobileOffset={{
        top: "calc(1rem + 6px + env(safe-area-inset-top))",
        left: "calc(1rem + 6px + env(safe-area-inset-left))",
        right: "calc(1rem + 66px + env(safe-area-inset-right))",
      }}
      {...props}
    />
  )
}

export { Toaster }
