import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/cloudflare-setup.test.ts", "test/deploy-config.test.ts"],
    environment: "node",
    testTimeout: 10_000,
  },
});
