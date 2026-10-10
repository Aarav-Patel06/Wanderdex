"use client";

import { useState } from "react";

import { Logout } from "pixelarticons/react/Logout";
import { Trash } from "pixelarticons/react/Trash";

import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { DeleteAccountDialog } from "@/components/profile/delete-account-dialog";
import { ExportData } from "@/components/profile/export-data";
import { LogoutDialog } from "@/components/shell/logout-dialog";
import { Button } from "@/components/ui/8bit/button";

// The profile's Account section (SPEC §14.6): change password, export data, delete account, and
// log out (on phones the only one). Each action is a panel, like the stats tiles.
export function AccountSection({ username }: { username: string }) {
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  return (
    <section aria-labelledby="account-title" className="flex flex-col gap-4">
      <h2 id="account-title">Account</h2>
      <section aria-labelledby="password-title" className="visits-panel flex flex-col gap-4">
        <h3 id="password-title">Change password</h3>
        <ChangePasswordForm />
      </section>
      <section aria-labelledby="export-title" className="visits-panel flex flex-col gap-4">
        <h3 id="export-title">Export data</h3>
        <p>All your visits with their places, as a spreadsheet (CSV) or JSON.</p>
        <ExportData />
      </section>
      <section aria-labelledby="delete-title" className="visits-panel flex flex-col gap-4">
        <h3 id="delete-title">Delete account</h3>
        <p>Deletes your visits and private places for good.</p>
        {/* mx: the button's pixel border sits 6px outside it. */}
        <Button type="button" variant="secondary" onClick={() => setDeleteOpen(true)} className="mx-1.5 gap-2 self-start">
          <Trash aria-hidden="true" className="size-6 shrink-0" />
          Delete account
        </Button>
      </section>
      <Button type="button" variant="secondary" onClick={() => setLogoutOpen(true)} className="mx-1.5 gap-2 self-start">
        <Logout aria-hidden="true" className="size-6 shrink-0" />
        Log out
      </Button>
      {deleteOpen && <DeleteAccountDialog username={username} onClose={() => setDeleteOpen(false)} />}
      <LogoutDialog open={logoutOpen} onOpenChange={setLogoutOpen} />
    </section>
  );
}
