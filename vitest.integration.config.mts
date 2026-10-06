import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests: query/mutation và RLS với Supabase local (bắt đầu từ TASK-002).
// passWithNoTests: tới TASK-002 mới có test; script vẫn tồn tại để quy trình ổn định.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    passWithNoTests: true,
  },
});
