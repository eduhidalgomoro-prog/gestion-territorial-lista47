import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      DATA_BACKEND: "memory",
      AUTH_SECRET: "test-secret-de-al-menos-32-caracteres-ok",
      ADMIN_EMAILS: "admin@lista47.test",
      APP_TIMEZONE: "America/Argentina/Buenos_Aires",
    },
  },
});
