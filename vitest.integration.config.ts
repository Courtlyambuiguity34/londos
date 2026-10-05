import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    onUnhandledError(error) {
      // pg attaches connection details (including a password) to idle errors.
      // Retain the failure, message and code; remove credential-bearing context.
      if (error && typeof error === "object") delete (error as Record<string, unknown>).client;
    },
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
