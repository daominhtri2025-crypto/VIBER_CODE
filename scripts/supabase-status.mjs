import { execFileSync } from "node:child_process";

/** Đọc trạng thái Supabase local qua CLI (khóa local được sinh khi `supabase start`). */
export function readLocalSupabaseStatus() {
  let output;
  try {
    output = execFileSync("npx", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error("Supabase local chưa chạy. Chạy `npm run db:start` trước.", { cause: error });
  }
  const start = output.indexOf("{");
  if (start === -1) {
    throw new Error("Không đọc được kết quả `supabase status -o json`.");
  }
  return JSON.parse(output.slice(start));
}
