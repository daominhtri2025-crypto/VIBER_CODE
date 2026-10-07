import { describe, expect, it } from "vitest";
import { AUTH_MESSAGES, authErrorMessage, isExistingAccountError } from "./errors";
import { safeNextPath } from "./redirect";
import { parseSignIn, parseSignUp } from "./validation";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("parseSignUp", () => {
  const valid = { displayName: "  Bé   Na ", email: " An@Example.COM ", password: "matkhau123", confirmPassword: "matkhau123" };

  it("chuẩn hóa tên hiển thị và email", () => {
    expect(parseSignUp(form(valid))).toEqual({
      ok: true,
      data: { displayName: "Bé Na", email: "an@example.com", password: "matkhau123" },
    });
  });

  it("cho phép bỏ trống tên hiển thị (trigger đặt mặc định)", () => {
    const result = parseSignUp(form({ ...valid, displayName: "" }));
    expect(result.ok && result.data.displayName).toBe("");
  });

  it("báo lỗi theo từng trường", () => {
    const result = parseSignUp(
      form({ displayName: "x".repeat(51), email: "khong-phai-email", password: "ngan", confirmPassword: "khac" }),
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        displayName: "Tên hiển thị tối đa 50 ký tự.",
        email: "Email chưa đúng định dạng.",
        password: "Mật khẩu cần ít nhất 8 ký tự.",
        confirmPassword: "Mật khẩu nhập lại không khớp.",
      },
    });
  });

  it("từ chối mật khẩu vượt 72 byte (giới hạn bcrypt), tính theo byte UTF-8", () => {
    const longVietnamese = "ạ".repeat(25); // 25 ký tự nhưng 75 byte
    const result = parseSignUp(form({ ...valid, password: longVietnamese, confirmPassword: longVietnamese }));
    expect(result.ok ? undefined : result.fieldErrors.password).toBe("Mật khẩu quá dài.");
  });
});

describe("parseSignIn", () => {
  it("yêu cầu email hợp lệ và mật khẩu", () => {
    expect(parseSignIn(form({ email: "", password: "" }))).toEqual({
      ok: false,
      fieldErrors: { email: "Nhập email.", password: "Nhập mật khẩu." },
    });
  });

  it("không áp độ dài tối thiểu khi đăng nhập (tránh lộ chính sách cũ/mới)", () => {
    expect(parseSignIn(form({ email: "a@b.vn", password: "x" })).ok).toBe(true);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/learn/python/bai-1?x=1#muc", "/learn/python/bai-1?x=1#muc"],
    ["/dashboard", "/dashboard"],
  ])("giữ đường dẫn nội bộ %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "evil",
    "/ok\nSet-Cookie:x",
    "",
    undefined,
    ["/dashboard"],
  ])("thay bằng /dashboard với giá trị không an toàn %o", (input) => {
    expect(safeNextPath(input)).toBe("/dashboard");
  });
});

describe("authErrorMessage", () => {
  it("dùng cùng một thông điệp cho sai mật khẩu và tài khoản không tồn tại", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toBe(AUTH_MESSAGES.invalidCredentials);
    expect(authErrorMessage({ code: "user_not_found" })).toBe(AUTH_MESSAGES.invalidCredentials);
  });

  it("nhận diện giới hạn tần suất theo mã hoặc HTTP 429", () => {
    expect(authErrorMessage({ code: "over_request_rate_limit" })).toBe(AUTH_MESSAGES.rateLimited);
    expect(authErrorMessage({ status: 429 })).toBe(AUTH_MESSAGES.rateLimited);
  });

  it("lỗi không xác định dùng thông điệp chung, không lộ chi tiết kỹ thuật", () => {
    expect(authErrorMessage({ code: "unexpected_failure", message: "db timeout at 10.0.0.1" })).toBe(
      AUTH_MESSAGES.unexpected,
    );
  });

  it("nhận diện lỗi email đã tồn tại để giữ phản hồi trung tính", () => {
    expect(isExistingAccountError({ code: "user_already_exists" })).toBe(true);
    expect(isExistingAccountError({ code: "invalid_credentials" })).toBe(false);
  });
});
