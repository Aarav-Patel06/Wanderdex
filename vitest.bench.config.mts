import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// `pnpm bench:import` (SPEC §11.8 step 11): the Trip Photos benchmark only, outside `pnpm test`.
// Same setup as vitest.config.mts.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["scripts/bench-import.ts"],
  },
});
