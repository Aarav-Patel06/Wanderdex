import { type VariantProps, cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ButtonHTMLAttributes, Ref } from "react";

import { Button as ShadcnButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import "@/components/ui/8bit/styles/retro.css";

const pressed = "drop-shadow-pixel active:translate-x-1 active:translate-y-1 active:drop-shadow-none";

export const buttonVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
    // Layered over the base shadcn variants (SPEC §16.6). Press = pushed flat into the
    // page: move by the full 4px shadow offset and drop the shadow. Instant, no easing.
    variant: {
      default: pressed,
      destructive: pressed,
      outline: pressed,
      secondary: `${pressed} hover:bg-surface-dark`,
      // SPEC §16.3: accent text fails contrast, so ghost = text color + accent underline.
      ghost:
        "text-text underline decoration-accent decoration-4 underline-offset-4 hover:bg-transparent aria-expanded:bg-transparent active:translate-y-0.5",
      link: "",
    },
    size: {
      default: "",
      sm: "",
      lg: "",
      icon: "",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export interface BitButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

interface ButtonDecorationsProps {
  size: BitButtonProps["size"];
  variant: BitButtonProps["variant"];
}

function ButtonDecorations({ size, variant }: ButtonDecorationsProps) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none contents"
      data-slot="button-decorations"
    >
      {variant !== "ghost" && variant !== "link" && size !== "icon" && (
        <>
          {/* Pixelated border */}
          <span className="absolute -top-1.5 left-1.5 h-1.5 w-1/2 bg-foreground dark:bg-ring" />
          <span className="absolute -top-1.5 right-1.5 h-1.5 w-1/2 bg-foreground dark:bg-ring" />
          <span className="absolute -bottom-1.5 left-1.5 h-1.5 w-1/2 bg-foreground dark:bg-ring" />
          <span className="absolute -bottom-1.5 right-1.5 h-1.5 w-1/2 bg-foreground dark:bg-ring" />
          <span className="absolute top-0 left-0 size-1.5 bg-foreground dark:bg-ring" />
          <span className="absolute top-0 right-0 size-1.5 bg-foreground dark:bg-ring" />
          <span className="absolute bottom-0 left-0 size-1.5 bg-foreground dark:bg-ring" />
          <span className="absolute right-0 bottom-0 size-1.5 bg-foreground dark:bg-ring" />
          <span className="absolute top-1.5 -left-1.5 h-[calc(100%-12px)] w-1.5 bg-foreground dark:bg-ring" />
          <span className="absolute top-1.5 -right-1.5 h-[calc(100%-12px)] w-1.5 bg-foreground dark:bg-ring" />
          {variant !== "outline" && (
            <>
              {/* Top shadow */}
              <span className="absolute top-0 left-0 h-1.5 w-full bg-foreground/20" />
              <span className="absolute top-1.5 left-0 h-1.5 w-3 bg-foreground/20" />

              {/* Bottom shadow */}
              <span className="absolute bottom-0 left-0 h-1.5 w-full bg-foreground/20" />
              <span className="absolute right-0 bottom-1.5 h-1.5 w-3 bg-foreground/20" />
            </>
          )}
        </>
      )}

      {size === "icon" && (
        <>
          <span className="absolute top-0 left-0 h-[5px] w-full bg-foreground md:h-1.5 dark:bg-ring" />
          <span className="absolute bottom-0 h-[5px] w-full bg-foreground md:h-1.5 dark:bg-ring" />
          <span className="absolute top-1 -left-1 h-1/2 w-[5px] bg-foreground md:w-1.5 dark:bg-ring" />
          <span className="absolute bottom-1 -left-1 h-1/2 w-[5px] bg-foreground md:w-1.5 dark:bg-ring" />
          <span className="absolute top-1 -right-1 h-1/2 w-[5px] bg-foreground md:w-1.5 dark:bg-ring" />
          <span className="absolute -right-1 bottom-1 h-1/2 w-[5px] bg-foreground md:w-1.5 dark:bg-ring" />
        </>
      )}
    </span>
  );
}

function Button({
  asChild = false,
  children,
  className,
  font,
  size,
  variant,
  ...props
}: BitButtonProps) {
  const decorations = <ButtonDecorations size={size} variant={variant} />;

  return (
    <ShadcnButton
      {...props}
      className={cn(
        "rounded-none transition-none relative inline-flex items-center justify-center gap-1.5 border-none min-h-11 px-4 text-button",
        buttonVariants({ variant }),
        size === "icon" && "mx-1 my-0 size-11 px-0",
        // The focus ring (globals.css) goes outside the pixel border, which would cover it.
        variant !== "ghost" && variant !== "link" && (size === "icon" ? "[--focus-offset:4px]" : "[--focus-offset:6px]"),
        font !== "normal" && "retro",
        className
      )}
      size={size}
      variant={variant}
      asChild={asChild}
    >
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : children}
      {decorations}
    </ShadcnButton>
  );
}

export { Button };
