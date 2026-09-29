"use client";

import React from "react";

import { type VariantProps, cva } from "class-variance-authority";
import { Close } from "pixelarticons/react/Close";
import { toast as sonnerToast } from "sonner";

import { cn } from "@/lib/utils";

import "@/components/ui/8bit/styles/retro.css";

// SPEC §16.6: success = success bg + dark text; first country = visited bg + dark text.
const toastVariants = cva("", {
  variants: {
    variant: {
      default: "bg-surface text-text",
      success: "bg-success text-text",
      visited: "bg-visited text-text",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

type ToastOptions = VariantProps<typeof toastVariants> & {
  description?: string;
};

// Auto-dismiss (~4 s) comes from the Toaster in components/ui/sonner.tsx (SPEC §16.8).
export function toast(title: string, { description, variant }: ToastOptions = {}) {
  return sonnerToast.custom((id) => (
    <Toast id={id} title={title} description={description} variant={variant} />
  ));
}

interface ToastProps extends ToastOptions {
  id: string | number;
  title: string;
}

function Toast({ id, title, description, variant }: ToastProps) {
  return (
    // font-body: sonner sets its own font-family on the toaster.
    <div className="relative w-full font-body md:w-[356px]">
      <div
        className={cn(
          "flex w-full items-center gap-2 py-2 pr-1 pl-4",
          toastVariants({ variant })
        )}
      >
        <div className="flex-1">
          <p className="text-body">{title}</p>
          {description && <p className="text-small">{description}</p>}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => sonnerToast.dismiss(id)}
          className="flex size-11 shrink-0 items-center justify-center"
        >
          <Close className="size-6" />
        </button>
      </div>

      <div className="absolute -top-1.5 w-1/2 left-1.5 h-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute -top-1.5 w-1/2 right-1.5 h-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute -bottom-1.5 w-1/2 left-1.5 h-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute -bottom-1.5 w-1/2 right-1.5 h-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute top-0 left-0 size-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute top-0 right-0 size-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute bottom-0 left-0 size-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute bottom-0 right-0 size-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute top-1 -left-1.5 h-1/2 w-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute bottom-1 -left-1.5 h-1/2 w-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute top-1 -right-1.5 h-1/2 w-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute bottom-1 -right-1.5 h-1/2 w-1.5 bg-foreground dark:bg-ring" />
    </div>
  );
}
