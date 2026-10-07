import { describe, expect, it } from "vitest";
import { hasFreshRecovery } from "./recovery";
import { parseEmailOnly, parseNewPassword } from "./validation";

const NOW = 1_800_000_000;

describe("hasFreshRecovery", () => {
  it("chấp nhận amr recovery trong vòng 1 giờ", () => {
    expect(hasFreshRecovery([{ method: "recovery", timestamp: NOW - 60 }], NOW)).toBe(true);
    expect(hasFreshRecovery([{ method: "recovery", timestamp: NOW - 3600 }], NOW)).toBe(true);
  });

  it("từ chối session đăng nhập thường, recovery quá hạn hoặc dữ liệu lạ", () => {
    expect(hasFreshRecovery([{ method: "password", timestamp: NOW }], NOW)).toBe(false);
    expect(hasFreshRecovery([{ method: "recovery", timestamp: NOW - 3601 }], NOW)).toBe(false);
    expect(hasFreshRecovery([{ method: "recovery", timestamp: NOW + 60 }], NOW)).toBe(false);
    expect(hasFreshRecovery([{ method: "recovery", timestamp: "gần đây" }], NOW)).toBe(false);
    expect(hasFreshRecovery(undefined, NOW)).toBe(false);
    expect(hasFreshRecovery("recovery", NOW)).toBe(false);
  });
});

describe("parseEmailOnly / parseNewPassword", () => {
  const form = (values: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  };

  it("chuẩn hóa email", () => {
    expect(parseEmailOnly(form({ email: " A@B.VN " }))).toEqual({ ok: true, data: { email: "a@b.vn" } });
    expect(parseEmailOnly(form({ email: "" })).ok).toBe(false);
  });

  it("mật khẩu mới phải đủ dài và khớp", () => {
    expect(parseNewPassword(form({ password: "matkhau-moi-1", confirmPassword: "matkhau-moi-1" }))).toEqual({
      ok: true,
      data: { password: "matkhau-moi-1" },
    });
    expect(parseNewPassword(form({ password: "ngan", confirmPassword: "khac" }))).toEqual({
      ok: false,
      fieldErrors: { password: "Mật khẩu cần ít nhất 8 ký tự.", confirmPassword: "Mật khẩu nhập lại không khớp." },
    });
  });
});
