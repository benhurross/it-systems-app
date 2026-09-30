import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // `.test.tsx` files render components in jsdom; `.test.ts` files run on Node against PGlite.
    projects: [
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./tests/helpers/setup-dom.ts"],
        },
      },
      {
        extends: true,
        // Each file runs its own in-process Postgres. A test taking 1-2 s alone can pass 5 s while the
        // browser suite shares the machine, so these get more room than Vitest's default.
        test: { name: "node", environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 30_000 },
      },
    ],
    coverage: {
      include: ["src/lib/**", "src/server/**"],
      // Connection and configuration glue, exercised end to end by Playwright rather than here.
      exclude: ["src/server/db/**", "src/server/current-user.ts", "src/lib/auth-client.ts"],
      reporter: ["text", "html"],
    },
  },
});
