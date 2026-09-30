"use client";

import { useState, useTransition } from "react";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logout } from "pixelarticons/react/Logout";
import { Map as MapIcon } from "pixelarticons/react/Map";
import { Notes } from "pixelarticons/react/Notes";
import { Plus } from "pixelarticons/react/Plus";

import { logout } from "@/app/(app)/actions";
import { RpgDialog } from "@/components/dialogs/rpg-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/8bit/dropdown-menu";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Overworld", Icon: MapIcon },
  { href: "/visits", label: "My Visits", Icon: Notes },
] as const;

const sidebarItem = "flex min-h-11 w-full items-center gap-3 px-3 text-left font-display text-button";

// Minimal app shell (SPEC §14.1): desktop sidebar, mobile bottom tab bar, and a
// mobile avatar menu on the Overworld. Log out always goes through the RPG dialog.
export function AppShell({ username, children }: { username: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [leaving, startLeaving] = useTransition();
  const initial = username.charAt(0).toUpperCase();

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <aside className="hidden w-72 shrink-0 flex-col gap-8 bg-text p-4 text-background md:flex">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/sprites/passport.png"
            alt=""
            width={64}
            height={64}
            unoptimized
            className="pixelated"
          />
          <span className="font-display text-h3">WANDERDEX</span>
        </Link>

        <nav aria-label="Main" className="flex flex-col gap-2">
          {NAV_LINKS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={cn(
                sidebarItem,
                pathname === href ? "bg-primary text-on-primary" : "hover:bg-background/10",
              )}
            >
              <Icon aria-hidden="true" className="size-6 shrink-0" />
              {label}
            </Link>
          ))}
          {/* Opens the add panel in a later step. */}
          <button type="button" className={cn(sidebarItem, "hover:bg-background/10")}>
            <Plus aria-hidden="true" className="size-6 shrink-0" />
            Add Visit
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <UserInitial initial={initial} />
            <span className="truncate">{username}</span>
          </div>
          <button
            type="button"
            onClick={() => setLogoutOpen(true)}
            className={cn(sidebarItem, "hover:bg-background/10")}
          >
            <Logout aria-hidden="true" className="size-6 shrink-0" />
            Log out
          </button>
        </div>
      </aside>

      {/* Mobile: bottom padding = the fixed tab bar (4rem tabs + safe-area inset), so nothing hides behind it. */}
      <main className="relative min-h-0 flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}

        {pathname === "/" && (
          // modal={false}: the menu hands off to the RPG dialog without the two fighting over focus.
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              aria-label={`${username} menu`}
              className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 shadow-pixel md:hidden"
            >
              <UserInitial initial={initial} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setLogoutOpen(true)}>
                <Logout aria-hidden="true" className="size-6" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </main>

      {/* The dark fill runs under the home indicator and Safari's toolbar; the padding keeps the tabs clear of them. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 grid grid-cols-3 bg-text pb-[env(safe-area-inset-bottom)] text-background md:hidden"
      >
        {NAV_LINKS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={cn(tabItem, pathname === href ? "border-accent text-accent" : "border-transparent")}
          >
            <Icon aria-hidden="true" className="size-6" />
            {label}
          </Link>
        ))}
        {/* Opens the add drawer in a later step. */}
        <button type="button" className={cn(tabItem, "border-transparent")}>
          <Plus aria-hidden="true" className="size-6" />
          Add Visit
        </button>
      </nav>

      <RpgDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        title="Leave the Overworld?"
        choices={[
          {
            label: "Yes",
            onSelect: () => {
              if (!leaving) startLeaving(() => logout());
            },
          },
          { label: "No", onSelect: () => setLogoutOpen(false) },
        ]}
      />
    </div>
  );
}

// Active tab = accent (5.4:1 on the dark bar). Cream on primary is only OK at 16px+ (SPEC §16.3).
// min-h-16 must match the 4rem bottom padding on <main>.
const tabItem = "flex min-h-16 flex-col items-center justify-center gap-1 border-t-4 font-display text-tab";

// The user's initial in a pixel frame.
function UserInitial({ initial }: { initial: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-11 shrink-0 items-center justify-center border-4 border-accent bg-primary font-display text-button text-on-primary"
    >
      {initial}
    </span>
  );
}
