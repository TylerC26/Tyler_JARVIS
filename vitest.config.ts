import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    // Mirror tsconfig's "@/*" → "./*" so tests can load app modules.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
