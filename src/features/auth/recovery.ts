/** Thời hạn dùng session khôi phục để đặt mật khẩu mới; bằng thời hạn link (otp_expiry = 3600s). */
export const RECOVERY_MAX_AGE_SECONDS = 60 * 60;

type AmrEntry = { method?: unknown; timestamp?: unknown };

/**
 * Session có được tạo từ link khôi phục gần đây không (claim `amr` của Supabase Auth).
 * Session đăng nhập thường (`amr.method = password`) không đủ để đổi mật khẩu tại /reset-password.
 */
export function hasFreshRecovery(
  amr: unknown,
  nowSeconds: number,
  maxAgeSeconds: number = RECOVERY_MAX_AGE_SECONDS,
): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((entry: AmrEntry) => {
    if (entry?.method !== "recovery" || typeof entry.timestamp !== "number") return false;
    const age = nowSeconds - entry.timestamp;
    return age >= 0 && age <= maxAgeSeconds;
  });
}
