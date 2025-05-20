import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@nimbus/stats": path.resolve(__dirname, "../../packages/stats/src/index.ts"),
      "@nimbus/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
});
