import type { Metadata } from "next";

import { ProfileView } from "@/components/profile/profile-view";
import { currentProfile } from "@/lib/profile";
import { loadStatsVisits } from "@/lib/stats/load";
import { profileStats } from "@/lib/stats/profile";

export const metadata: Metadata = { title: "Profile · Wanderdex" };

// Profile (SPEC §14.6): computed on the server from the user's own rows.
export default async function ProfilePage() {
  const [{ username, joined }, rows] = await Promise.all([currentProfile(), loadStatsVisits()]);
  return <ProfileView username={username} joined={joined} stats={profileStats(rows)} />;
}
