import { type VariantProps, cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

import {
  Card as ShadcnCard,
  CardAction as ShadcnCardAction,
  CardContent as ShadcnCardContent,
  CardDescription as ShadcnCardDescription,
  CardFooter as ShadcnCardFooter,
  CardHeader as ShadcnCardHeader,
  CardTitle as ShadcnCardTitle,
} from "@/components/ui/card";

import "@/components/ui/8bit/styles/retro.css";

export const cardVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
  },
  defaultVariants: {
    font: "normal",
  },
});

export interface BitCardProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof cardVariants> {
  asChild?: boolean;
}

function Card({ className, font, ...props }: BitCardProps) {
  return (
    <div
      className={cn(
        "relative bg-card text-card-foreground border-y-6 border-foreground dark:border-ring p-0! drop-shadow-pixel",
        className
      )}
    >
      <ShadcnCard
        {...props}
        className={cn(
          "rounded-none border-0 w-full! h-full flex flex-col bg-card text-card-foreground shadow-none ring-0 text-body",
          font === "retro" && "retro",
          className
        )}
      />

      <div
        className={cn("absolute inset-0 border-x-6 -mx-1.5 border-inherit pointer-events-none")}
        aria-hidden="true"
      />
    </div>
  );
}

function CardHeader({ ...props }: BitCardProps) {
  const { className, font } = props;

  return (
    <ShadcnCardHeader
      {...props}
      className={cn(font === "retro" && "retro", className)}
    />
  );
}

function CardTitle({ ...props }: BitCardProps) {
  const { className, font } = props;

  return (
    <ShadcnCardTitle
      {...props}
      className={cn("text-h3", font !== "normal" && "retro", className)}
    />
  );
}

function CardDescription({ ...props }: BitCardProps) {
  const { className, font } = props;

  return (
    <ShadcnCardDescription
      {...props}
      className={cn("text-small", font === "retro" && "retro", className)}
    />
  );
}

function CardAction({ ...props }: BitCardProps) {
  const { className, font } = props;

  return (
    <ShadcnCardAction
      {...props}
      className={cn(font === "retro" && "retro", className)}
    />
  );
}

function CardContent({ ...props }: BitCardProps) {
  const { className, font } = props;

  return (
    <ShadcnCardContent
      {...props}
      className={cn("flex-1", font === "retro" && "retro", className)}
    />
  );
}

function CardFooter({ ...props }: BitCardProps) {
  const { className, font } = props;

  return (
    <ShadcnCardFooter
      data-slot="card-footer"
      {...props}
      className={cn(font === "retro" && "retro", className)}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
