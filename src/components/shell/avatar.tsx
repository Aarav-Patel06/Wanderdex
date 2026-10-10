import Link from "next/link";

import { cn } from "@/lib/utils";

// The user's initial in a pixel frame: an accent border on a primary fill (cream on primary is
// fine at 16px Press Start 2P, SPEC §16.3). The sidebar's profile item and the profile header.
export function UserInitial({ username, className }: { username: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-11 shrink-0 items-center justify-center border-4 border-accent bg-primary font-display text-button text-on-primary",
        className,
      )}
    >
      {username.charAt(0).toUpperCase()}
    </span>
  );
}

// Phones' avatar button (SPEC §14.1): the initial, opening the profile, on the Overworld and My
// Visits. 52px wide, as wide as the map's icon buttons with their pixel borders (44px plus 4px
// each side), so on the Overworld it heads their column. Press pushes it flat (shell.css).
export function AvatarLink({
  username,
  className,
  ...props
}: { username: string } & Omit<React.ComponentProps<typeof Link>, "href">) {
  return (
    <Link
      {...props}
      href="/profile"
      aria-label="Profile"
      className={cn("avatar-link shrink-0 shadow-pixel md:hidden", className)}
    >
      <UserInitial username={username} className="w-13" />
    </Link>
  );
}
