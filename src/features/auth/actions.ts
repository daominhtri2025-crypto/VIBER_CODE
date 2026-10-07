"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authErrorMessage, isExistingAccountError } from "./errors";
import { safeNextPath } from "./redirect";
import { parseSignIn, parseSignUp, type SignInField, type SignUpField } from "./validation";

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

