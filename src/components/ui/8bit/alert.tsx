import { type VariantProps, cva } from "class-variance-authority";
import { SquareAlert } from "pixelarticons/react/SquareAlert";
import { WarningDiamond } from "pixelarticons/react/WarningDiamond";

import { cn } from "@/lib/utils";

import {
  Alert as ShadcnAlert,
  AlertDescription as ShadcnAlertDescription,
  AlertTitle as ShadcnAlertTitle,
} from "@/components/ui/alert";

export const alertVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
    // SPEC §16.6: warning = warning bg, error = error bg, both with dark text.
    variant: {
      default: "bg-card text-card-foreground",
      destructive:
        "text-destructive bg-card [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90",
      warning: "bg-warning text-text",
      error: "bg-error text-text",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const variantIcons = {
  warning: WarningDiamond,
  error: SquareAlert,
};

export interface BitAlertProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof alertVariants> {}

function Alert({ children, className, font, variant, ...props }: BitAlertProps) {
  const Icon = variant === "warning" || variant === "error" ? variantIcons[variant] : null;

  // The caller's classes (e.g. a margin) go on the wrapper, which the pixel border below is
  // positioned against, so the border always hugs the filled box.
  return (
    <div className={cn("relative", className)}>
      <ShadcnAlert
        {...props}
        className={cn(
          "relative rounded-none border-none bg-background text-body",
          alertVariants({ variant }),
          font === "retro" && "retro"
        )}
      >
        {Icon && <Icon aria-hidden="true" className="size-6" />}
        {children}
      </ShadcnAlert>

      <div className="absolute -top-1.5 w-1/2 left-1.5 h-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute -top-1.5 w-1/2 right-1.5 h-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute -bottom-1.5 w-1/2 left-1.5 h-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute -bottom-1.5 w-1/2 right-1.5 h-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute top-0 left-0 size-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute top-0 right-0 size-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute bottom-0 left-0 size-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute bottom-0 right-0 size-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute top-1.5 -left-1.5 h-1/2 w-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute bottom-1.5 -left-1.5 h-1/2 w-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute top-1.5 -right-1.5 h-1/2 w-1.5 bg-foreground dark:bg-ring" />
      <div className="absolute bottom-1.5 -right-1.5 h-1/2 w-1.5 bg-foreground dark:bg-ring" />
    </div>
  );
}

function AlertTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <ShadcnAlertTitle
      className={cn("font-medium tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <ShadcnAlertDescription
      className={cn(
        "text-current grid justify-items-start gap-1 text-body [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
