export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt (GoTrue) chỉ dùng 72 byte đầu của mật khẩu. */
export const PASSWORD_MAX_BYTES = 72;
export const DISPLAY_NAME_MAX_LENGTH = 50;
const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;
export type ParseResult<Data, Field extends string> =
  | { ok: true; data: Data }
  | { ok: false; fieldErrors: FieldErrors<Field> };

export type SignUpField = "displayName" | "email" | "password" | "confirmPassword";
export type SignUpInput = { displayName: string; email: string; password: string };
export type SignInField = "email" | "password";
export type SignInInput = { email: string; password: string };

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function emailError(email: string): string | undefined {
  if (email === "") return "Nhập email.";
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) return "Email chưa đúng định dạng.";
  return undefined;
}

function passwordError(password: string): string | undefined {
  if (password.length < PASSWORD_MIN_LENGTH) return `Mật khẩu cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return "Mật khẩu quá dài.";
  return undefined;
}

export function parseSignUp(formData: FormData): ParseResult<SignUpInput, SignUpField> {
  const displayName = readText(formData, "displayName").normalize("NFC").trim().replace(/\s+/g, " ");
  const email = normalizeEmail(readText(formData, "email"));
  const password = readText(formData, "password");
  const confirmPassword = readText(formData, "confirmPassword");

  const fieldErrors: FieldErrors<SignUpField> = {};
  if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    fieldErrors.displayName = `Tên hiển thị tối đa ${DISPLAY_NAME_MAX_LENGTH} ký tự.`;
  }
  const emailIssue = emailError(email);
  if (emailIssue) fieldErrors.email = emailIssue;
  const passwordIssue = passwordError(password);
  if (passwordIssue) fieldErrors.password = passwordIssue;
  if (confirmPassword !== password) fieldErrors.confirmPassword = "Mật khẩu nhập lại không khớp.";

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: { displayName, email, password } };
}

export function parseSignIn(formData: FormData): ParseResult<SignInInput, SignInField> {
  const email = normalizeEmail(readText(formData, "email"));
  const password = readText(formData, "password");

  const fieldErrors: FieldErrors<SignInField> = {};
  const emailIssue = emailError(email);
  if (emailIssue) fieldErrors.email = emailIssue;
  if (password === "") fieldErrors.password = "Nhập mật khẩu.";

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: { email, password } };
}

export type EmailOnlyField = "email";
export type NewPasswordField = "password" | "confirmPassword";

export function parseEmailOnly(formData: FormData): ParseResult<{ email: string }, EmailOnlyField> {
  const email = normalizeEmail(readText(formData, "email"));
  const emailIssue = emailError(email);
  if (emailIssue) return { ok: false, fieldErrors: { email: emailIssue } };
  return { ok: true, data: { email } };
}

export function parseNewPassword(formData: FormData): ParseResult<{ password: string }, NewPasswordField> {
  const password = readText(formData, "password");
  const confirmPassword = readText(formData, "confirmPassword");
  const fieldErrors: FieldErrors<NewPasswordField> = {};
  const passwordIssue = passwordError(password);
  if (passwordIssue) fieldErrors.password = passwordIssue;
  if (confirmPassword !== password) fieldErrors.confirmPassword = "Mật khẩu nhập lại không khớp.";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, data: { password } };
}
