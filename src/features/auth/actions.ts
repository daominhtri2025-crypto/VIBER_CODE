"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AUTH_MESSAGES, authErrorMessage, isExistingAccountError } from "./errors";
import { safeNextPath } from "./redirect";
import { hasRecoverySession } from "./session";
import {
  parseEmailOnly,
  parseNewPassword,
  parseSignIn,
  parseSignUp,
  type NewPasswordField,
  type SignInField,
  type SignUpField,
} from "./validation";

export type SignUpState =
  | { status: "idle" }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Partial<Record<SignUpField, string>>;
      values: { displayName: string; email: string };
    }
  | { status: "check-email"; email: string };

export type SignInState =
  | { status: "idle" }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Partial<Record<SignInField, string>>;
      values: { email: string };
    };

export type ResetRequestState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: { email?: string }; values: { email: string } }
  | { status: "sent" };

export type NewPasswordState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: Partial<Record<NewPasswordField, string>> }
  | { status: "updated" };

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Origin của request hiện tại để dựng link xác thực; GoTrue còn kiểm tra allowlist redirect. */
async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (origin) return new URL(origin).origin;
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  if (!host) throw new Error("Không xác định được origin của request.");
  return new URL(`${protocol}://${host}`).origin;
}

export async function signUp(_previous: SignUpState, formData: FormData): Promise<SignUpState> {
  const values = { displayName: formText(formData, "displayName"), email: formText(formData, "email") };
  const parsed = parseSignUp(formData);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors, values };

  const next = safeNextPath(formData.get("next"));
  const callback = new URL("/auth/callback", await requestOrigin());
  callback.searchParams.set("next", next);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: callback.toString(),
      data: { display_name: parsed.data.displayName },
    },
  });

  if (error && !isExistingAccountError(error)) {
    console.error("auth.signUp failed", { code: error.code, status: error.status });
    return { status: "error", message: authErrorMessage(error), values };
  }
  // Khi tắt xác thực email (không phải cấu hình mặc định) sẽ có session ngay.
  if (data.session) redirect(next);
  return { status: "check-email", email: parsed.data.email };
}

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const values = { email: formText(formData, "email") };
  const parsed = parseSignIn(formData);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors, values };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code !== "invalid_credentials") {
      console.error("auth.signIn failed", { code: error.code, status: error.status });
    }
    return { status: "error", message: authErrorMessage(error), values };
  }
  redirect(safeNextPath(formData.get("next")));
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) console.error("auth.signOut failed", { code: error.code, status: error.status });
  redirect("/");
}


/** Gửi email khôi phục; luôn trả cùng kết quả để không tiết lộ email có tài khoản hay không. */
export async function requestPasswordReset(
  _previous: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const values = { email: formText(formData, "email") };
  const parsed = parseEmailOnly(formData);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors, values };

  const callback = new URL("/auth/callback", await requestOrigin());
  callback.searchParams.set("next", "/reset-password");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callback.toString(),
  });
  if (error) {
    const message = authErrorMessage(error);
    if (message === AUTH_MESSAGES.rateLimited) return { status: "error", message, values };
    console.error("auth.resetPasswordForEmail failed", { code: error.code, status: error.status });
  }
  return { status: "sent" };
}

/** Đặt mật khẩu mới; chỉ cho phép với session tạo từ link khôi phục còn hiệu lực. */
export async function updatePassword(_previous: NewPasswordState, formData: FormData): Promise<NewPasswordState> {
  if (!(await hasRecoverySession())) {
    return { status: "error", message: "Liên kết khôi phục đã hết hạn. Hãy yêu cầu liên kết mới." };
  }
  const parsed = parseNewPassword(formData);
  if (!parsed.ok) return { status: "error", fieldErrors: parsed.fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { status: "error", fieldErrors: { password: "Mật khẩu mới cần khác mật khẩu cũ." } };
    }
    console.error("auth.updatePassword failed", { code: error.code, status: error.status });
    return { status: "error", message: authErrorMessage(error) };
  }
  return { status: "updated" };
}
