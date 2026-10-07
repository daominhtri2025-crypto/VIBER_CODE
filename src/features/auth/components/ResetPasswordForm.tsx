"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updatePassword, type NewPasswordState } from "../actions";
import { PASSWORD_MIN_LENGTH } from "../validation";
import { FormAlert, FormField, SubmitButton } from "./FormField";

const initialState: NewPasswordState = { status: "idle" };

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initialState);

  if (state.status === "updated") {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-md border border-green-300 bg-green-50 px-4 py-3">
        <p className="font-semibold">Đã đặt mật khẩu mới.</p>
        <Link href="/dashboard" className="font-medium text-primary underline">
          Vào trang của tôi
        </Link>
      </div>
    );
  }

  const errors = state.status === "error" ? state.fieldErrors : undefined;
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <FormAlert message={state.status === "error" ? state.message : undefined} />
      <FormField
        id="password"
        name="password"
        type="password"
        label="Mật khẩu mới"
        hint={`Ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`}
        autoComplete="new-password"
        required
        error={errors?.password}
      />
      <FormField
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Nhập lại mật khẩu mới"
        autoComplete="new-password"
        required
        error={errors?.confirmPassword}
      />
      <SubmitButton pending={pending}>Đặt mật khẩu mới</SubmitButton>
    </form>
  );
}
