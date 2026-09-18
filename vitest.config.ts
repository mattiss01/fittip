import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    // Playwright owns the browser flows; the helpers beside them are ordinary
    // units and run here.
    exclude: [".worktrees/**", "e2e/**/*.spec.ts", "node_modules/**"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
