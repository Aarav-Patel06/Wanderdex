import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";

import "@/components/ui/8bit/styles/retro.css";

export const inputVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
  },
  // SPEC §16.4: inputs use the VT323 body font.
  defaultVariants: {
    font: "normal",
  },
});

export interface BitTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof inputVariants> {
  asChild?: boolean;
  ref?: React.Ref<HTMLTextAreaElement>;
}

function Textarea({ font, ...props }: BitTextareaProps) {
  const { className } = props;

  return (
    <div className={cn("relative w-full", className)}>
      <ShadcnTextarea
        {...props}
        className={cn(
          "rounded-none transition-transform ring-0 border-0 bg-background text-body text-text md:text-body placeholder:text-text/70 [--focus-offset:6px]",
          font === "retro" && "retro",
          className
        )}
      />

      <div
        className="absolute inset-0 border-y-6 -my-1.5 border-foreground dark:border-ring pointer-events-none"
        aria-hidden="true"
      />

      <div
        className="absolute inset-0 border-x-6 -mx-1.5 border-foreground dark:border-ring pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}

export { Textarea };
