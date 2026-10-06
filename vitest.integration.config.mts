import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests: query/mutation và RLS với Supabase local (`npm run db:start`).
// Mỗi file tự dựng và dọn dữ liệu với hậu tố ngẫu nhiên nên có thể chạy song song.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
