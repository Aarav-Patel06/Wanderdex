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
import { AddVisitProvider, useAddVisitController } from "@/components/add/add-visit-context";
import { RpgDialog } from "@/components/dialogs/rpg-dialog";
import { useTrackNavigation } from "@/components/shell/back-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/8bit/dropdown-menu";
import { cn } from "@/lib/utils";

import "./shell.css";

const OVERWORLD = { href: "/", label: "Overworld", Icon: MapIcon } as const;
const MY_VISITS = { href: "/visits", label: "My Visits", Icon: Notes } as const;
const NAV_LINKS = [OVERWORLD, MY_VISITS] as const;

// Lift, press, and the current page's shadow live in shell.css (.nav-item).
const sidebarItem =
  "nav-item flex min-h-11 flex-1 items-center gap-3 px-3 text-left font-display text-button";

// Minimal app shell (SPEC §14.1): desktop sidebar, mobile bottom tab bar, and a
// mobile avatar menu on the Overworld. Log out always goes through the RPG dialog.
export function AppShell({ username, children }: { username: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [leaving, startLeaving] = useTransition();
  const [spinning, setSpinning] = useState(false);
  const addVisit = useAddVisitController();
  useTrackNavigation();
  const addPanelOpen = addVisit.open && pathname === "/";
  const initial = username.charAt(0).toUpperCase();

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      {/* A floating RPG box (SPEC §14.1, §16.9). The Overworld's map runs full-bleed behind it and
          keeps its pins clear of it (the map reads data-sidebar); other pages pad past it. */}
      <aside
        data-sidebar
        className="sidebar fixed inset-y-4 left-4 z-10 hidden w-80 drop-shadow-pixel md:block"
      >
        <div className="rpg-box relative flex h-full flex-col gap-8 overflow-y-auto border-6 border-accent bg-text p-4 text-background">
          <span aria-hidden="true" className="rpg-box-corner top-0 left-0" />
          <span aria-hidden="true" className="rpg-box-corner top-0 right-0" />
          <span aria-hidden="true" className="rpg-box-corner bottom-0 left-0" />
          <span aria-hidden="true" className="rpg-box-corner right-0 bottom-0" />

          <Link href="/" className="logo flex items-center gap-3 self-start">
            <span className="logo-sprite">
              <Image
                src="/sprites/passport.png"
                alt=""
                width={64}
                height={64}
                unoptimized
                className="pixelated"
              />
              <span aria-hidden="true" className="sparkle" />
            </span>
            <span className="font-display text-h3">WANDERDEX</span>
          </Link>

          {/* Add Visit is a subitem of Overworld, indented under it and joined to it by a stepped
              pixel line (.nav-branch, shell.css). */}
          <nav aria-label="Main">
            <ul className="flex flex-col gap-2">
              <SidebarLink {...OVERWORLD} current={pathname === OVERWORLD.href} />
              <li className="nav-row relative flex items-center gap-2 pl-12">
                <span aria-hidden="true" className="nav-branch" />
                <NavCursor />
                <button
                  type="button"
                  data-add-visit
                  aria-haspopup="dialog"
                  aria-expanded={addPanelOpen}
                  data-spin={spinning || undefined}
                  onClick={() => {
                    setSpinning(true);
                    addVisit.toggle();
                  }}
                  onAnimationEnd={(event) => {
                    if (event.animationName === "nav-spin") setSpinning(false);
                  }}
                  className={cn(sidebarItem, "nav-add hover:bg-background/10")}
                >
                  <Plus aria-hidden="true" className="nav-add-icon size-6 shrink-0" />
                  Add Visit
                  <span aria-hidden="true" className="sparkle" />
                </button>
              </li>
              <SidebarLink {...MY_VISITS} current={pathname === MY_VISITS.href} />
            </ul>
          </nav>

          <div className="mt-auto flex flex-col gap-4">
            <hr className="border-0 border-t-2 border-accent" />
            <div className="flex min-w-0 items-center gap-3 pl-6">
              <UserInitial initial={initial} />
              <span className="truncate">{username}</span>
            </div>
            <div className="nav-row flex items-center gap-2">
              <NavCursor />
              <button
                type="button"
                onClick={() => setLogoutOpen(true)}
                className={cn(sidebarItem, "hover:bg-background/10")}
              >
                <Logout aria-hidden="true" className="size-6 shrink-0" />
                Log out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile: bottom padding = the fixed tab bar (4rem tabs + safe-area inset), so nothing hides behind it.
          Desktop: pages other than the Overworld start past the sidebar (1rem margin + 20rem + 1rem). */}
      <main
        className={cn(
          "relative min-h-0 flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0",
          pathname !== "/" && "md:pl-88",
        )}
      >
        {/* The Overworld's add panel and empty-state hint read the panel's state through this. */}
        <AddVisitProvider value={addVisit}>{children}</AddVisitProvider>

        {pathname === "/" && (
          // modal={false}: the menu hands off to the RPG dialog without the two fighting over focus.
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              aria-label={`${username} menu`}
              className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-[calc(1rem+env(safe-area-inset-right))] shadow-pixel md:hidden"
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
        className="fixed inset-x-0 bottom-0 grid grid-cols-3 border-t-4 border-accent bg-text pb-[env(safe-area-inset-bottom)] text-background md:hidden"
      >
        {NAV_LINKS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={cn(tabItem, pathname === href && "text-accent")}
          >
            <span className="relative">
              {pathname === href && (
                <span aria-hidden="true" className="absolute top-0 right-full mr-1 text-button">
                  ▶︎
                </span>
              )}
              <Icon aria-hidden="true" className="size-6" />
            </span>
            <span>{label}</span>
          </Link>
        ))}
        <button
          type="button"
          data-add-visit
          aria-haspopup="dialog"
          aria-expanded={addPanelOpen}
          onClick={addVisit.toggle}
          className={tabItem}
        >
          <Plus aria-hidden="true" className="size-6" />
          <span>Add Visit</span>
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

// Active tab = accent (5.4:1 on the dark bar) plus the "▶" marker beside its icon. Cream on
// primary is only OK at 16px+ (SPEC §16.3). 60px tabs + the bar's 4px accent top border =
// the 4rem bottom padding on <main>. Press (shell.css) nudges the tab's content down.
const tabItem = "tab-item flex min-h-15 flex-col items-center justify-center gap-1 font-display text-tab";

function SidebarLink({
  href,
  label,
  Icon,
  current,
}: (typeof NAV_LINKS)[number] & { current: boolean }) {
  return (
    <li className="nav-row flex items-center gap-2">
      <NavCursor />
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={cn(sidebarItem, current ? "bg-primary text-on-primary" : "hover:bg-background/10")}
      >
        <Icon aria-hidden="true" className="size-6 shrink-0" />
        {label}
      </Link>
    </li>
  );
}

// The RPG cursor's slot beside a sidebar item; shell.css shows it on one item at a time.
function NavCursor() {
  return (
    <span aria-hidden="true" className="nav-cursor w-4 shrink-0 font-display text-button text-accent">
      ▶︎
    </span>
  );
}

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
