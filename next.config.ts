import { networkInterfaces } from "node:os";

import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// This machine's own IPv4 addresses, so a phone on the same network can load the dev
// server at http://<LAN IP>:3000. Next blocks dev assets for other hosts by default.
// Looked up at startup, so it follows DHCP changes and no IP is committed.
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((net) => net?.family === "IPv4" && !net.internal)
    .map((net) => net!.address);
}

// Only `next dev` gets the LAN origins; builds and production servers never look them up.
export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) return { allowedDevOrigins: lanAddresses() };
  return {};
}
