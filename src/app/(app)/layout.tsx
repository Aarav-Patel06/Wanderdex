import { AppShell } from "@/components/shell/app-shell";
import { currentProfile } from "@/lib/profile";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { username } = await currentProfile();
  return <AppShell username={username}>{children}</AppShell>;
}
