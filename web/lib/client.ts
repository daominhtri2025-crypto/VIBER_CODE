"use client";

/** Browser-side API access through the same-origin BFF (tokens stay in httpOnly cookies). */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public detail?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const r = await fetch(`/bff/api/${path.replace(/^\//, "")}`, {
    method,
    headers: { "x-mt-client": "web", ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (r.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết, em đăng nhập lại nhé.");
  }
  if (r.status === 204) return undefined as T;
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data.error ?? "ERROR", humanError(r.status, data), data.detail);
  return data as T;
}

function humanError(status: number, data: { error?: string; message?: string }): string {
  if (data.error === "VERSION_CONFLICT") return "Bài đã thay đổi ở nơi khác. Đã tải lại trạng thái mới nhất.";
  if (data.error === "BUSY") return "Máy chủ đang bận. Bấm gửi lại, bài làm không bị mất.";
  if (status === 403) return "Tài khoản này không có quyền làm việc đó.";
  if (status === 404) return "Không tìm thấy nội dung, hoặc em không có quyền xem.";
  if (status === 422) return data.message && data.message !== "Invalid request" ? data.message : "Thông tin nhập chưa hợp lệ.";
  return data.message ?? "Có lỗi xảy ra.";
}

/** One id per user action; reused verbatim when that same action is retried. */
export function newRequestId(prefix = "w"): string {
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}-${Date.now().toString(36)}-${rnd[0].toString(36)}${rnd[1].toString(36)}`;
}
