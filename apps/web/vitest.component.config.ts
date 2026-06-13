import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/client/components/**/*.test.tsx",
      "src/client/contexts/**/*.test.tsx",
      "src/client/hooks/**/*.test.ts",
      "src/client/screens/**/*.test.tsx",
      "src/client/lib/**/*.test.ts",
    ],
    environment: "jsdom",
    testTimeout: 10_000,
    setupFiles: ["test/setup-component-tests.ts"],
  },
});
