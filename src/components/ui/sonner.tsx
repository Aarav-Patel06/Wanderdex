"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

// No dark mode (SPEC §1.2), so next-themes and sonner's icon set are not used.
// Toasts are rendered by the 8bit toast() in components/ui/8bit/toast.tsx.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-center"
      duration={4000}
      {...props}
    />
  )
}

export { Toaster }
