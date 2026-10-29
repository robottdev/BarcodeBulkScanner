import { defineConfig } from "vitest/config";

export default defineConfig({
  worker: {
    format: "es",
  },
  build: {
    target: "safari16",
  },
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
