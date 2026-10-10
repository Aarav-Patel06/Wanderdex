"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { errorCopy, sendJson } from "@/components/add/api";
import { usernameInputProps } from "@/components/auth/form-field";
import { RpgDialog } from "@/components/dialogs/rpg-dialog";
import { Loading } from "@/components/loading";
import { Alert, AlertDescription } from "@/components/ui/8bit/alert";
import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";
import { usernameMatches } from "@/lib/account";

// Delete account's RPG confirm (SPEC §14.6): "Delete account" stays disabled until the typed
// name matches. Afterwards the user is already signed out (the route clears the cookies), and a
// full load of /login drops everything the app held. Mounted while open.
export function DeleteAccountDialog({ username, onClose }: { username: string; onClose: () => void }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, startDeleting] = useTransition();
  const matches = usernameMatches(typed, username);

  function remove() {
    if (!matches || deleting) return;
    setError(null);
    startDeleting(async () => {
      const result = await sendJson("DELETE", "/api/account", { username: typed });
      if (result.ok) return window.location.replace("/login?deleted=1");
      if (result.error === "unauthorized") return router.push("/login");
      setError(errorCopy(result.error));
    });
  }

  return (
    <RpgDialog
      open
      onOpenChange={(next) => {
        if (!next && !deleting) onClose();
      }}
      title="Delete your account?"
      description="Your visits and private places will be deleted. This can't be undone."
      choices={[
        { label: "Delete account", onSelect: remove, disabled: !matches || deleting },
        { label: "Cancel", onSelect: onClose, disabled: deleting },
      ]}
    >
      <div className="flex flex-col gap-4">
        <p className="text-small">Want a copy? Export your data first.</p>
        {/* The field keeps its light look on a surface panel with notched corners, as in the edit
            dialog: its dark pixel border would vanish on the dark box. Enter deletes too. */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            remove();
          }}
          className="rpg-box flex flex-col gap-3 bg-surface p-4 text-text"
        >
          <Label htmlFor="delete-username">Type {username} to confirm</Label>
          <Input
            id="delete-username"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={deleting}
            {...usernameInputProps}
            autoComplete="off"
          />
          {deleting && <Loading />}
          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </form>
      </div>
    </RpgDialog>
  );
}
