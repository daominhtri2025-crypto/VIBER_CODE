"use client";

import { useActionState } from "react";
import { signUp, type SignUpState } from "../actions";
import { DISPLAY_NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../validation";
import { FormAlert, FormField, SubmitButton } from "./FormField";

const initialState: SignUpState = { status: "idle" };

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUp, initialState);

  if (state.status === "check-email") {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-md border border-green-300 bg-green-50 px-4 py-3">
        <p className="font-semibold">Kiểm tra hộp thư của bạn</p>
        <p>
          Nếu <strong>{state.email}</strong> có thể dùng để đăng ký, chúng tôi đã gửi một email xác thực. Mở
          email và bấm vào liên kết để hoàn tất.
        </p>
      </div>
    );
  }

  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <FormAlert message={state.status === "error" ? state.message : undefined} />
      <FormField
        id="displayName"
        name="displayName"
        label="Tên hiển thị (không bắt buộc)"
        hint="Tên này hiện trên trang của bạn. Không cần dùng họ tên thật."
        autoComplete="nickname"
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        defaultValue={values?.displayName}
        error={errors?.displayName}
      />
      <FormField
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        defaultValue={values?.email}
        error={errors?.email}
      />
      <FormField
        id="password"
        name="password"
        type="password"
        label="Mật khẩu"
        hint={`Ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`}
        autoComplete="new-password"
        required
        error={errors?.password}
      />
      <FormField
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Nhập lại mật khẩu"
        autoComplete="new-password"
        required
        error={errors?.confirmPassword}
      />
      <SubmitButton pending={pending}>Tạo tài khoản</SubmitButton>
    </form>
  );
}
