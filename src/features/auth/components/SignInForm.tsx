"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "../actions";
import { FormAlert, FormField, SubmitButton } from "./FormField";

const initialState: SignInState = { status: "idle" };

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, initialState);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <FormAlert message={state.status === "error" ? state.message : undefined} />
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
        autoComplete="current-password"
        required
        error={errors?.password}
      />
      <SubmitButton pending={pending}>Đăng nhập</SubmitButton>
    </form>
  );
}
