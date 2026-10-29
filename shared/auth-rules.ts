// Quy tắc đầu vào và chính sách đăng nhập cho quản trị viên và tình nguyện viên (SRS FR-AUTH; CLAUDE.md mục 2, 4).
// Hàm thuần, không truy vấn dữ liệu: kiểm thử đơn vị không cần cơ sở dữ liệu.

// Mật khẩu tối thiểu 10 ký tự (quyết định ngày 2026-10-29). Trần 200 để chặn chuỗi quá dài khi băm.
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;
// Khóa tạm sau 5 lần sai liên tiếp, trong 15 phút (quyết định ngày 2026-10-29).
export const LOCK_THRESHOLD = 5;
export const LOCK_MINUTES = 15;
// Phiên 12 giờ; cookie không có Max-Age dài hơn thời hạn phiên trên máy chủ.
export const SESSION_HOURS = 12;
export const SESSION_COOKIE = 'st_session';

const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;
const MAX_ID_LENGTH = 64;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

function asObject(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
}

export function validateEmail(raw: unknown): Validated<string> {
  if (typeof raw !== 'string') return { ok: false, error: 'Email không hợp lệ' };
  const email = raw.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return { ok: false, error: 'Email không hợp lệ' };
  return { ok: true, value: email };
}

// Chính sách mật khẩu áp dụng khi tạo, đặt lại và đổi mật khẩu.
export function validateNewPassword(raw: unknown): Validated<string> {
  if (typeof raw !== 'string' || raw.length < PASSWORD_MIN_LENGTH || raw.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: `Mật khẩu phải có từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_LENGTH} ký tự` };
  }
  return { ok: true, value: raw };
}

// Đăng nhập không kiểm tra độ dài mật khẩu để không lộ chính sách cho người thử đoán; chỉ chặn chuỗi rỗng hoặc quá dài.
export function validateLogin(input: unknown): Validated<{ email: string; password: string }> {
  const body = asObject(input);
  const email = validateEmail(body.email);
  if (email.ok === false) return { ok: false, error: email.error };
  if (typeof body.password !== 'string' || body.password.length === 0 || body.password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: 'Vui lòng nhập email và mật khẩu' };
  }
  return { ok: true, value: { email: email.value, password: body.password } };
}

export function validateFullName(raw: unknown): Validated<string | null> {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string' || raw.trim().length > MAX_NAME_LENGTH) return { ok: false, error: 'Họ tên không hợp lệ' };
  return { ok: true, value: raw.trim() || null };
}

export function validateCreateAccount(input: unknown): Validated<{ email: string; password: string; fullName: string | null }> {
  const body = asObject(input);
  const email = validateEmail(body.email);
  if (email.ok === false) return { ok: false, error: email.error };
  const password = validateNewPassword(body.password);
  if (password.ok === false) return { ok: false, error: password.error };
  const fullName = validateFullName(body.full_name);
  if (fullName.ok === false) return { ok: false, error: fullName.error };
  return { ok: true, value: { email: email.value, password: password.value, fullName: fullName.value } };
}

export function validateChangePassword(input: unknown): Validated<{ current: string; next: string }> {
  const body = asObject(input);
  if (typeof body.current !== 'string' || body.current.length === 0 || body.current.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: 'Vui lòng nhập mật khẩu hiện tại' };
  }
  const next = validateNewPassword(body.next);
  if (next.ok === false) return { ok: false, error: next.error };
  return { ok: true, value: { current: body.current, next: next.value } };
}

export function validateAccountId(raw: unknown): Validated<string> {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_ID_LENGTH) return { ok: false, error: 'Tài khoản không hợp lệ' };
  return { ok: true, value: raw };
}

export function validateResetPassword(input: unknown): Validated<{ id: string; password: string }> {
  const body = asObject(input);
  const id = validateAccountId(body.id);
  if (id.ok === false) return { ok: false, error: id.error };
  const password = validateNewPassword(body.password);
  if (password.ok === false) return { ok: false, error: password.error };
  return { ok: true, value: { id: id.value, password: password.value } };
}

export function validateStatusChange(input: unknown): Validated<{ id: string; active: boolean }> {
  const body = asObject(input);
  const id = validateAccountId(body.id);
  if (id.ok === false) return { ok: false, error: id.error };
  if (typeof body.active !== 'boolean') return { ok: false, error: 'Trạng thái không hợp lệ' };
  return { ok: true, value: { id: id.value, active: body.active } };
}

// Thời điểm ISO 8601 UTC sau `now` đúng `minutes` phút. Mọi thời điểm lưu theo UTC (CLAUDE.md mục 5).
export function addMinutes(now: string, minutes: number): string {
  return new Date(Date.parse(now) + minutes * 60_000).toISOString();
}

export function addHours(now: string, hours: number): string {
  return addMinutes(now, hours * 60);
}
