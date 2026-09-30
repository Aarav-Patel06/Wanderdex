import { networkInterfaces } from "node:os";

import type { NextConfig } from "next";

// This machine's own IPv4 addresses, so a phone on the same network can load the dev
// server at http://<LAN IP>:3000. Next blocks dev assets for other hosts by default.
// Looked up at startup, so it follows DHCP changes and no IP is committed.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((net) => net?.family === "IPv4" && !net.internal)
  .map((net) => net!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
};

export default nextConfig;
