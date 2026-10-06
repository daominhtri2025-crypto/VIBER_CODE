import { describe, expect, it } from "vitest";
import { parseSupabasePublicEnv } from "./env";

describe("parseSupabasePublicEnv", () => {
  it("chuẩn hóa URL về origin và giữ publishable key", () => {
    expect(
      parseSupabasePublicEnv({ url: " http://127.0.0.1:54321/ ", publishableKey: "sb_publishable_x" }),
    ).toEqual({ url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_x" });
  });

  it.each([
    [{ url: undefined, publishableKey: "sb_publishable_x" }],
    [{ url: "http://127.0.0.1:54321", publishableKey: "  " }],
  ])("báo lỗi khi thiếu biến môi trường: %o", (raw) => {
    expect(() => parseSupabasePublicEnv(raw)).toThrow(/Thiếu NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("từ chối URL không hợp lệ hoặc sai giao thức", () => {
    expect(() => parseSupabasePublicEnv({ url: "khong-phai-url", publishableKey: "k" })).toThrow(
      /không phải URL hợp lệ/,
    );
    expect(() => parseSupabasePublicEnv({ url: "ftp://example.com", publishableKey: "k" })).toThrow(
      /http hoặc https/,
    );
  });

  it("từ chối secret key bị đặt nhầm vào biến public", () => {
    expect(() =>
      parseSupabasePublicEnv({ url: "http://127.0.0.1:54321", publishableKey: "sb_secret_abc" }),
    ).toThrow(/secret key/);
  });
});
