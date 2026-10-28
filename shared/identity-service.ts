// Dịch vụ tra cứu quyền tình nguyện viên và khởi tạo học viên (FR-AUTH-01 đến 03; CLAUDE.md mục 3, 4.8).
// Route đọc header danh tính và cờ quản trị (OWNER_EMAIL) rồi gọi các hàm ở đây để truy vấn bảng staff và learners.
// Không nhận yêu cầu HTTP: dùng chung cho route (Sites) và máy chủ cục bộ.

// Giao diện tối thiểu khớp prepare/bind/first/run của D1 và của adapter kiểm thử.
export interface IdentityStatement {
  bind(...values: unknown[]): IdentityStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface IdentityDb {
  prepare(query: string): IdentityStatement;
}

// Email có trong bảng staff thì được coi là tình nguyện viên. Email đã được route chuẩn hóa chữ thường.
export async function isStaffEmail(db: IdentityDb, email: string): Promise<boolean> {
  const row = await db.prepare('SELECT email FROM staff WHERE email=?').bind(email).first();
  return row !== null;
}

// Trả mã học viên của danh tính; chưa có thì tạo một lần (INSERT OR IGNORE giữ mã cũ nếu hai yêu cầu đua nhau).
// newCode chỉ được gọi khi thật sự cần tạo, để không sinh mã thừa cho học viên đã có.
export async function ensureLearnerCode(
  db: IdentityDb,
  learnerId: string,
  newCode: () => string,
  now: string,
): Promise<string> {
  const existing = await db.prepare('SELECT code FROM learners WHERE id=?').bind(learnerId).first<{ code: string }>();
  if (existing) return existing.code;
  await db.prepare('INSERT OR IGNORE INTO learners(id,code,created) VALUES(?,?,?)').bind(learnerId, newCode(), now).run();
  const stored = await db.prepare('SELECT code FROM learners WHERE id=?').bind(learnerId).first<{ code: string }>();
  if (!stored) throw new Error('learner missing');
  return stored.code;
}
