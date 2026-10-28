// Dịch vụ phân quyền tình nguyện viên (FR-ADM; CLAUDE.md mục 3). Chuyển từ route.ts sang đây:
// route chỉ kiểm tra quyền, đọc yêu cầu và trả HTTP; quy tắc email và truy vấn nằm ở đây.
// Không nhận yêu cầu HTTP, nên dùng được cho route (Sites) và máy chủ cục bộ khi cần.

// Giao diện tối thiểu khớp prepare/bind/run của D1 và của adapter kiểm thử.
export interface StaffStatement {
  bind(...values: unknown[]): StaffStatement;
  run(): Promise<unknown>;
}
export interface StaffDb {
  prepare(query: string): StaffStatement;
}

export type StaffChange = { ok: true; email: string; remove: boolean } | { ok: false; error: string };

const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

// Kiểm tra đầu vào của POST /api/staff. Body không phải object (ví dụ null) được coi là thiếu email, trả lỗi 400.
export function validateStaffChange(input: unknown): StaffChange {
  const body = (typeof input === 'object' && input !== null ? input : {}) as { email?: unknown; remove?: unknown };
  if (typeof body.email !== 'string' || body.email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(body.email)) {
    return { ok: false, error: 'Email không hợp lệ' };
  }
  return { ok: true, email: body.email.toLowerCase().trim(), remove: Boolean(body.remove) };
}

// Thêm hoặc thu hồi quyền đánh giá. Thêm lại email đã có không tạo bản ghi mới (INSERT OR IGNORE).
export async function applyStaffChange(db: StaffDb, change: { email: string; remove: boolean }, now: string): Promise<void> {
  if (change.remove) {
    await db.prepare('DELETE FROM staff WHERE email=?').bind(change.email).run();
  } else {
    await db.prepare('INSERT OR IGNORE INTO staff(email,created) VALUES(?,?)').bind(change.email, now).run();
  }
}
