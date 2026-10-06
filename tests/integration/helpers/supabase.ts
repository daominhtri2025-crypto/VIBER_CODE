import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { readLocalSupabaseStatus } from "../../../scripts/supabase-status.mjs";

export type Client = SupabaseClient<Database>;

type LocalConfig = { url: string; publishableKey: string; secretKey: string };

let cached: LocalConfig | undefined;

/** Cấu hình lấy từ biến môi trường (CI) hoặc `supabase status` (local). Không ghi ra file. */
export function localConfig(): LocalConfig {
  if (cached) return cached;
  const fromEnv = {
    url: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY,
  };
  if (fromEnv.url && fromEnv.publishableKey && fromEnv.secretKey) {
    cached = { url: fromEnv.url, publishableKey: fromEnv.publishableKey, secretKey: fromEnv.secretKey };
    return cached;
  }
  const status: Record<string, string> = readLocalSupabaseStatus();
  cached = {
    url: status.API_URL,
    publishableKey: status.PUBLISHABLE_KEY,
    secretKey: status.SECRET_KEY,
  };
  return cached;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export function anonClient(): Client {
  const { url, publishableKey } = localConfig();
  return createClient<Database>(url, publishableKey, noSession);
}

/**
 * Client bỏ qua RLS. CHỈ dùng để dựng/dọn dữ liệu kiểm thử và provision role admin
 * (tương đương thao tác SQL của chủ database theo ADR-003); không dùng để chứng minh quyền.
 */
export function serviceClient(): Client {
  const { url, secretKey } = localConfig();
  return createClient<Database>(url, secretKey, noSession);
}

export async function signedInClient(email: string, password: string): Promise<Client> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

/** Ném lỗi kèm ngữ cảnh khi bước dựng dữ liệu thất bại. */
export function must<T>(result: { data: T; error: { message: string } | null }, step: string): NonNullable<T> {
  if (result.error || result.data === null || result.data === undefined) {
    throw new Error(`${step}: ${result.error?.message ?? "không có dữ liệu"}`);
  }
  return result.data as NonNullable<T>;
}
