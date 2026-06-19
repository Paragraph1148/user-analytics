import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirror the "@/*" path alias from tsconfig.json so tests import the same way
    // the app does.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // A dummy URI so lib/db's module-level guard passes. The MongoClient connects
    // lazily, so nothing actually dials out during unit tests.
    env: { MONGODB_URI: "mongodb://localhost:27017/test" },
  },
});
