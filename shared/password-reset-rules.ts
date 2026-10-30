// Quy tắc khôi phục mật khẩu qua email (SRS FR-AUTH-11; CLAUDE.md mục 2C, 4).
// Hàm thuần, không truy vấn dữ liệu và không gọi mạng.
import { validateEmail, type Validated } from './auth-rules';

// Liên kết chỉ có hiệu lực 15 phút (quyết định ngày 2026-10-30, SRS mục 9.2 câu 15).
export const RESET_TOKEN_MINUTES = 15;
// Giới hạn số yêu cầu gửi email cho mỗi tài khoản trong một giờ. Vượt giới hạn: không gửi, phản hồi vẫn như thường.
// Giới hạn theo địa chỉ IP chưa làm trong mã; xem ghi chú trong SRS FR-AUTH-11 và tài liệu vận hành.
export const RESET_MAX_REQUESTS_PER_HOUR = 3;
// Giới hạn theo IP (quyết định 30/10/2026): chặn một mạng gửi hàng loạt thư tới nhiều địa chỉ khác nhau.
// Mười yêu cầu mỗi giờ đủ cho một hộ gia đình hoặc một điểm sinh hoạt cộng đồng dùng chung IP.
export const RESET_MAX_REQUESTS_PER_IP_PER_HOUR = 10;
// Token là 32 byte ngẫu nhiên, mã hóa base64url không đệm: 43 ký tự.
export const RESET_TOKEN_LENGTH = 43;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

// Thông báo chung cho mọi yêu cầu khôi phục: không tiết lộ email có tồn tại hay không.
export const FORGOT_GENERIC_MESSAGE = 'Nếu email này có trong hệ thống, liên kết đặt lại mật khẩu sẽ được gửi trong ít phút. Hãy kiểm tra cả hộp thư rác.';

export function validateForgotInput(input: unknown): Validated<string> {
  const body = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  return validateEmail(body.email);
}

export function validateResetToken(raw: unknown): Validated<string> {
  if (typeof raw !== 'string' || raw.length !== RESET_TOKEN_LENGTH || !TOKEN_PATTERN.test(raw)) {
    return { ok: false, error: 'Liên kết đặt lại không hợp lệ hoặc đã hết hạn' };
  }
  return { ok: true, value: raw };
}

// Liên kết trong email đặt token ở phần fragment (#), không đi qua máy chủ trong dòng yêu cầu và không vào nhật ký truy cập.
// Gốc của liên kết lấy từ cấu hình APP_BASE_URL, không lấy từ header Host của yêu cầu, để tránh giả mạo liên kết.
export function buildResetLink(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/admin#dat-lai=${token}`;
}

export function isValidBaseUrl(raw: string | undefined): raw is string {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
