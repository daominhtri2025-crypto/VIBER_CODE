"use client";

import { useActionState } from "react";
import { FormAlert, FormField, SubmitButton } from "@/features/auth/components/FormField";
import { DISPLAY_NAME_MAX_LENGTH, type DisplayNameField } from "@/features/auth/validation";
import { updateDisplayName, type ProfileFormState } from "../actions";

const initialState: ProfileFormState<DisplayNameField> = { status: "idle" };

export function DisplayNameForm({ currentName }: { currentName: string }) {
  const [state, action, pending] = useActionState(updateDisplayName, initialState);
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {state.status === "saved" ? (
        <p role="status" className="rounded-md border border-green-300 bg-green-50 px-3 py-2">
          Đã lưu tên hiển thị.
        </p>
      ) : null}
      <FormAlert message={state.status === "error" && !errors ? state.message : undefined} />
      <FormField
        id="displayName"
        name="displayName"
        label="Tên hiển thị"
        hint="Không cần dùng họ tên thật."
        autoComplete="nickname"
        required
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        defaultValue={currentName}
        error={errors?.displayName}
      />
      <SubmitButton pending={pending}>Lưu tên hiển thị</SubmitButton>
    </form>
  );
}
