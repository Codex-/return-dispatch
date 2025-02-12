/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.*", "src/test-utils/**/*.ts", "src/reset.d.ts"],
    },
    isolate: true,
  },
});
