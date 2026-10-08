import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      // `server-only` is a build-time guard with no runtime export; in tests it
      // has nothing to resolve to, so map it to an empty stub (a no-op here).
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    passWithNoTests: true,
  },
});
