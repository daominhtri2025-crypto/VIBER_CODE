"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ResetRequestState } from "../actions";
import { FormAlert, FormField, SubmitButton } from "./FormField";

const initialState: ResetRequestState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);

  if (state.status === "sent") {
    return (
      <p role="status" className="rounded-md border border-green-300 bg-green-50 px-4 py-3">
        Nếu email này có tài khoản, chúng tôi đã gửi liên kết đặt lại mật khẩu. Liên kết có hiệu lực trong 1 giờ.
      </p>
    );
  }

  const errors = state.status === "error" ? state.fieldErrors : undefined;
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <FormAlert message={state.status === "error" ? state.message : undefined} />
      <FormField
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        defaultValue={state.status === "error" ? state.values.email : undefined}
        error={errors?.email}
      />
      <SubmitButton pending={pending}>Gửi liên kết đặt lại</SubmitButton>
    </form>
  );
}
