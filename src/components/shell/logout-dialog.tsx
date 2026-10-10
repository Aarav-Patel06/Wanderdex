"use client";

import { useTransition } from "react";

import { logout } from "@/app/(app)/actions";
import { RpgDialog } from "@/components/dialogs/rpg-dialog";

// Log out's RPG confirm (SPEC §10), from the sidebar and the profile. It stays open until the
// redirect to /login.
export function LogoutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [leaving, startLeaving] = useTransition();
  return (
    <RpgDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Leave the Overworld?"
      choices={[
        {
          label: "Yes",
          onSelect: () => {
            if (!leaving) startLeaving(() => logout());
          },
        },
        { label: "No", onSelect: () => onOpenChange(false) },
      ]}
    />
  );
}
