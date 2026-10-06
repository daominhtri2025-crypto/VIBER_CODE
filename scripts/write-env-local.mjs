import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";

// Ghi .env.local cho Supabase local. Chỉ ghi giá trị public; KHÔNG ghi secret/service-role key.
const status = readLocalSupabaseStatus();
const managed = {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
};
if (!managed.NEXT_PUBLIC_SUPABASE_URL || !managed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("`supabase status` không trả API_URL/PUBLISHABLE_KEY.");
}

const path = ".env.local";
const kept = existsSync(path)
  ? readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "" && !Object.keys(managed).some((key) => line.startsWith(`${key}=`)))
  : [];
const lines = [...kept, ...Object.entries(managed).map(([key, value]) => `${key}=${value}`)];
writeFileSync(path, `${lines.join("\n")}\n`);
console.log(`Đã cập nhật ${path} (${Object.keys(managed).join(", ")}).`);
