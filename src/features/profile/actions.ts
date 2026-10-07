"use server";

import { revalidatePath } from "next/cache";
import { authErrorMessage } from "@/features/auth/errors";
import { ACTION_ERROR_MESSAGES, type ActionErrorCode } from "@/features/auth/guards";
import { getCurrentUser } from "@/features/auth/session";
import {
  parseChangePassword,
  parseDisplayName,
  type ChangePasswordField,
  type DisplayNameField,
} from "@/features/auth/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseStatelessClient } from "@/lib/supabase/stateless";

export type ProfileFormState<Field extends string> =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; code: ActionErrorCode; message: string; fieldErrors?: Partial<Record<Field, string>> };

function failure<Field extends string>(
  code: ActionErrorCode,
  fieldErrors?: Partial<Record<Field, string>>,
  message: string = ACTION_ERROR_MESSAGES[code],
): ProfileFormState<Field> {
  return { status: "error", code, message, fieldErrors };
}

/** Sửa tên hiển thị của chính người đang đăng nhập; không nhận user_id từ client. */
export async function updateDisplayName(
  _previous: ProfileFormState<DisplayNameField>,
  formData: FormData,
): Promise<ProfileFormState<DisplayNameField>> {
  const user = await getCurrentUser();
  if (!user) return failure("UNAUTHENTICATED");

  const parsed = parseDisplayName(formData);
  if (!parsed.ok) return failure("VALIDATION", parsed.fieldErrors);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", user.id)
    .select("id");
  if (error || !data || data.length !== 1) {
    console.error("profile.updateDisplayName failed", { code: error?.code });
    return failure("FORBIDDEN", undefined, "Không lưu được thay đổi. Vui lòng thử lại.");
  }

  revalidatePath("/", "layout");
  return { status: "saved" };
}

/** Đổi mật khẩu khi đang đăng nhập: bắt buộc xác minh lại mật khẩu hiện tại. */
export async function changePassword(
  _previous: ProfileFormState<ChangePasswordField>,
  formData: FormData,
): Promise<ProfileFormState<ChangePasswordField>> {
  const user = await getCurrentUser();
  if (!user || !user.email) return failure("UNAUTHENTICATED");

  const parsed = parseChangePassword(formData);
  if (!parsed.ok) return failure("VALIDATION", parsed.fieldErrors);

  const verifier = createSupabaseStatelessClient();
  const check = await verifier.auth.signInWithPassword({ email: user.email, password: parsed.data.currentPassword });
  if (check.error) {
    if (check.error.code === "invalid_credentials") {
      return failure("VALIDATION", { currentPassword: "Mật khẩu hiện tại không đúng." });
    }
    return failure("FORBIDDEN", undefined, authErrorMessage(check.error));
  }
  // Thu hồi phiên tạm vừa tạo để xác minh; không ảnh hưởng phiên trong cookie.
  await verifier.auth.signOut({ scope: "local" });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return failure("VALIDATION", { password: "Mật khẩu mới cần khác mật khẩu hiện tại." });
    }
    console.error("profile.changePassword failed", { code: error.code, status: error.status });
    return failure("FORBIDDEN", undefined, authErrorMessage(error));
  }
  return { status: "saved" };
}
