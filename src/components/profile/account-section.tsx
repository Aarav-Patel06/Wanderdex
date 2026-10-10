"use client";

import { useState } from "react";

import { Logout } from "pixelarticons/react/Logout";

import { LogoutDialog } from "@/components/shell/logout-dialog";
import { Button } from "@/components/ui/8bit/button";

// The profile's Account section (SPEC §14.6). Log out for now; on phones it's the only one.
// Change password, export, and delete account come in Phase 4.4.
export function AccountSection() {
  const [logoutOpen, setLogoutOpen] = useState(false);
  return (
    <section aria-labelledby="account-title" className="flex flex-col gap-4">
      <h2 id="account-title">Account</h2>
      {/* mx: the button's pixel border sits 6px outside it. */}
      <Button type="button" variant="secondary" onClick={() => setLogoutOpen(true)} className="mx-1.5 gap-2 self-start">
        <Logout aria-hidden="true" className="size-6 shrink-0" />
        Log out
      </Button>
      <LogoutDialog open={logoutOpen} onOpenChange={setLogoutOpen} />
    </section>
  );
}
