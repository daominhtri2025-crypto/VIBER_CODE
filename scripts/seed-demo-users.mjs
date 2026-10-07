import { createClient } from "@supabase/supabase-js";
import { assertLocalUrl, readLocalSupabaseStatus } from "./supabase-status.mjs";

// TASK-004 · Tạo tài khoản DEMO cho Supabase local (idempotent). Mật khẩu chỉ dùng local;
// script từ chối chạy nếu API không trỏ tới máy local. Danh sách: docs/operations/LOCAL_DEMO_ACCOUNTS.md.

export const DEMO_PASSWORD = "DemoLocal-2026!";
export const DEMO_USERS = [
  { key: "studentA", email: "hocvien.a@demo.example.test", displayName: "[Demo] Học viên A", role: "student" },
  { key: "studentB", email: "hocvien.b@demo.example.test", displayName: "[Demo] Học viên B", role: "student" },
  { key: "admin", email: "quantri@demo.example.test", displayName: "[Demo] Quản trị", role: "admin" },
];

const SCRATCH_COURSE = "c0000000-0000-4000-8000-000000000001";
const SCRATCH_LESSONS = ["e0000000-0000-4000-8000-000000000111", "e0000000-0000-4000-8000-000000000112"];

async function findUserByEmail(admin, email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((user) => user.email === email);
    if (found || data.users.length < 200) return found;
  }
}

async function main() {
  const status = readLocalSupabaseStatus();
  assertLocalUrl(status.API_URL);
  // Service role chỉ dùng cho thao tác quản trị local (tạo user, provision admin — ADR-003).
  const admin = createClient(status.API_URL, status.SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ids = {};
  for (const user of DEMO_USERS) {
    let existing = await findUserByEmail(admin, user.email);
    if (!existing) {
      const { data, error } = await admin.auth.admin.createUser({
        email: user.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { display_name: user.displayName },
      });
      if (error) throw error;
      existing = data.user;
    }
    ids[user.key] = existing.id;
    const { error } = await admin.from("user_roles").update({ role: user.role }).eq("user_id", existing.id);
    if (error) throw error;
  }

  // Học viên A: đã đăng ký khóa Scratch, xem 2 bài, hoàn thành bài 1 (để thử dashboard/học tiếp).
  const enroll = await admin
    .from("enrollments")
    .upsert({ user_id: ids.studentA, course_id: SCRATCH_COURSE }, { onConflict: "user_id,course_id" });
  if (enroll.error) throw enroll.error;
  const progress = await admin.from("lesson_progress").upsert(
    [
      { user_id: ids.studentA, lesson_id: SCRATCH_LESSONS[0], completed_at: new Date().toISOString() },
      { user_id: ids.studentA, lesson_id: SCRATCH_LESSONS[1] },
    ],
    { onConflict: "user_id,lesson_id" },
  );
  if (progress.error) throw progress.error;

  console.log("Tài khoản demo (chỉ dùng local):");
  for (const user of DEMO_USERS) console.log(`  ${user.role.padEnd(7)} ${user.email}`);
  console.log("Mật khẩu: xem docs/operations/LOCAL_DEMO_ACCOUNTS.md");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
