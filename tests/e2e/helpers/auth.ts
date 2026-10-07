import { randomUUID } from "node:crypto";
import { readLocalSupabaseStatus } from "../../../scripts/supabase-status.mjs";
import { serviceClient } from "../../integration/helpers/supabase";

export const E2E_PASSWORD = "e2e-local-Password1";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
}

/** Tạo user đã xác thực qua Admin API (chỉ để dựng dữ liệu kiểm thử). */
export async function createConfirmedUser(displayName = "[Test] E2E"): Promise<{ id: string; email: string }> {
  const email = uniqueEmail("e2e");
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  return { id: data.user.id, email };
}

export async function deleteUserByEmail(email: string): Promise<void> {
  const admin = serviceClient().auth.admin;
  const { data } = await admin.listUsers({ page: 1, perPage: 1000 });
  const user = data.users.find((candidate) => candidate.email === email);
  if (user) await admin.deleteUser(user.id);
}

type MailpitSummary = { ID: string };

/** Đợi email gửi tới `to` trong Mailpit local và trả link xác thực của Supabase Auth. */
export async function waitForAuthLink(to: string, timeoutMs = 15_000): Promise<string> {
  const mailpit = readLocalSupabaseStatus().MAILPIT_URL as string;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await search.json()) as { messages: MailpitSummary[] };
    if (messages.length > 0) {
      const message = await fetch(`${mailpit}/api/v1/message/${messages[0].ID}`);
      const { Text } = (await message.json()) as { Text: string };
      const link = Text.match(/https?:\/\/\S+\/auth\/v1\/verify\?\S+/)?.[0];
      if (link) return link.replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Không thấy email xác thực gửi tới ${to}`);
}
