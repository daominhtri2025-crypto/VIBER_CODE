export type AuthErrorLike = { code?: string; status?: number; message?: string };

export const AUTH_MESSAGES = {
  invalidCredentials: "Email hoặc mật khẩu không đúng.",
  emailNotConfirmed: "Email chưa được xác thực. Hãy mở email xác thực rồi đăng nhập lại.",
  rateLimited: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
  weakPassword: "Mật khẩu chưa đủ mạnh. Hãy dùng mật khẩu dài hơn, khó đoán hơn.",
  unexpected: "Có lỗi xảy ra. Vui lòng thử lại.",
} as const;

/** Chuyển lỗi Supabase Auth sang thông điệp tiếng Việt, không tiết lộ tài khoản có tồn tại hay không. */
export function authErrorMessage(error: AuthErrorLike): string {
  switch (error.code) {
    case "invalid_credentials":
    case "user_not_found":
      return AUTH_MESSAGES.invalidCredentials;
    case "email_not_confirmed":
      return AUTH_MESSAGES.emailNotConfirmed;
    case "weak_password":
      return AUTH_MESSAGES.weakPassword;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return AUTH_MESSAGES.rateLimited;
  }
  if (error.status === 429) return AUTH_MESSAGES.rateLimited;
  return AUTH_MESSAGES.unexpected;
}

/** Lỗi đăng ký có thể bỏ qua để giữ phản hồi trung tính (không tiết lộ email đã tồn tại). */
export function isExistingAccountError(error: AuthErrorLike): boolean {
  return error.code === "user_already_exists" || error.code === "email_exists";
}
