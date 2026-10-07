"use client";

import { useActionState } from "react";
import { FormAlert, FormField, SubmitButton } from "@/features/auth/components/FormField";
import { PASSWORD_MIN_LENGTH, type ChangePasswordField } from "@/features/auth/validation";
import { changePassword, type ProfileFormState } from "../actions";

const initialState: ProfileFormState<ChangePasswordField> = { status: "idle" };

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, initialState);
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    // key đổi sau khi lưu để xóa các ô mật khẩu.
    <form key={state.status === "saved" ? "saved" : "editing"} action={action} noValidate className="flex flex-col gap-4">
      {state.status === "saved" ? (
        <p role="status" className="rounded-md border border-green-300 bg-green-50 px-3 py-2">
          Đã đổi mật khẩu.
        </p>
      ) : null}
      <FormAlert message={state.status === "error" && !errors ? state.message : undefined} />
      <FormField
        id="currentPassword"
        name="currentPassword"
        type="password"
        label="Mật khẩu hiện tại"
        autoComplete="current-password"
        required
        error={errors?.currentPassword}
      />
      <FormField
        id="newPassword"
        name="password"
        type="password"
        label="Mật khẩu mới"
        hint={`Ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`}
        autoComplete="new-password"
        required
        error={errors?.password}
      />
      <FormField
        id="confirmNewPassword"
        name="confirmPassword"
        type="password"
        label="Nhập lại mật khẩu mới"
        autoComplete="new-password"
        required
        error={errors?.confirmPassword}
      />
      <SubmitButton pending={pending}>Đổi mật khẩu</SubmitButton>
    </form>
  );
}
