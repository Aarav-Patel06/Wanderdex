import { SquareAlert } from "pixelarticons/react/SquareAlert";

import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  name: string;
  label: string;
  errors?: string[];
}

// Label + 8bitcn input + inline error. Error text stays dark for contrast
// (SPEC §16.3); the error color is only on the icon.
export function FormField({ name, label, errors, ...props }: FormFieldProps) {
  const errorId = `${name}-error`;

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? errorId : undefined}
        {...props}
      />
      {errors && (
        <p id={errorId} className="flex items-center gap-2 text-small">
          <SquareAlert aria-hidden="true" className="size-6 shrink-0 text-error" />
          {errors[0]}
        </p>
      )}
    </div>
  );
}

// Props shared by every username input: no autocorrect or capitalization on phones.
export const usernameInputProps = {
  autoComplete: "username",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
} as const;
