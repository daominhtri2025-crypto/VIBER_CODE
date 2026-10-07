export const DEFAULT_AFTER_LOGIN = "/dashboard";
const PLACEHOLDER_ORIGIN = "http://internal.invalid";

/**
 * Chỉ chấp nhận đường dẫn nội bộ cho tham số `next` (chống open redirect).
 * Từ chối URL tuyệt đối, protocol-relative (`//host`), dấu `\`, ký tự điều khiển.
 */
export function safeNextPath(value: unknown, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (typeof value !== "string" || value === "") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (parsed.origin !== PLACEHOLDER_ORIGIN) return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
