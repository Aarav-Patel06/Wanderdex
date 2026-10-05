import { type VariantProps, cva } from "class-variance-authority";
import type { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

import { Calendar as ShadcnCalendar } from "@/components/ui/calendar";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import "@/components/ui/8bit/styles/retro.css";

export const calendarVariants = cva("", {
  variants: {
    font: {
      normal: "",
      retro: "retro",
    },
  },
  // SPEC §16.4: dates are body text (VT323).
  defaultVariants: {
    font: "normal",
  },
});

export type CalendarProps = React.ComponentProps<typeof DayPicker> &
  VariantProps<typeof calendarVariants>;

// 44px cells and nav buttons (SPEC §16.5). The selected day is accent with dark text:
// cream on primary is only OK for 16px+ Press Start 2P (SPEC §16.3).
const navButton =
  "size-(--cell-size) p-0 flex items-center justify-center select-none border-4 border-foreground bg-surface hover:bg-surface-dark aria-disabled:opacity-50 [&_svg]:size-6";

function Calendar({ className, classNames, font, ...props }: CalendarProps) {
  return (
    <div
      className={cn(
        "bg-popover relative border-y-6 border-foreground dark:border-ring w-max",
        className
      )}
    >
      <ShadcnCalendar
        className={cn(
          "[--cell-size:--spacing(11)]",
          calendarVariants({
            className,
            font,
          })
        )}
        classNames={{
          button_previous: navButton,
          button_next: navButton,
          caption_label: "select-none text-body",
          weekday: "flex-1 select-none text-small text-text",
          day_button:
            "text-body font-normal hover:bg-surface-dark focus-visible:z-20 data-[selected-single=true]:bg-accent data-[selected-single=true]:text-text",
          ...classNames,
        }}
        components={{
          MonthsDropdown: ({
            "aria-label": ariaLabel,
            className,
            disabled,
            onChange,
            options,
            value,
          }) => {
            return (
              <div className={cn("flex flex-col gap-3 text-xs", className)}>
                <Select
                  disabled={disabled}
                  onValueChange={(nextValue) => {
                    onChange?.({
                      target: { value: nextValue },
                    } as React.ChangeEvent<HTMLSelectElement>);
                  }}
                  value={value?.toString()}
                >
                  <SelectTrigger
                    aria-label={ariaLabel ?? "Month"}
                    className="bg-background w-full"
                  >
                    <SelectValue placeholder="Dropdown" />
                  </SelectTrigger>
                  <SelectContent align="center">
                    {options?.map((option) => (
                      <SelectItem
                        disabled={option.disabled}
                        key={option.value}
                        value={option.value.toString()}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          },
          YearsDropdown: ({
            "aria-label": ariaLabel,
            className,
            disabled,
            onChange,
            options,
            value,
          }) => {
            return (
              <div className={cn("flex flex-col gap-3 text-xs", className)}>
                <Select
                  disabled={disabled}
                  onValueChange={(nextValue) => {
                    onChange?.({
                      target: { value: nextValue },
                    } as React.ChangeEvent<HTMLSelectElement>);
                  }}
                  value={value?.toString()}
                >
                  <SelectTrigger
                    aria-label={ariaLabel ?? "Year"}
                    className="bg-background w-full"
                  >
                    <SelectValue placeholder="Dropdown" />
                  </SelectTrigger>
                  <SelectContent align="center">
                    {options?.map((option) => (
                      <SelectItem
                        disabled={option.disabled}
                        key={option.value}
                        value={option.value.toString()}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          },
        }}
        {...props}
      />

      <div
        className="absolute inset-0 border-x-6 -mx-1.5 border-foreground dark:border-ring pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}

export { Calendar };
