export type SupabasePublicEnv = {
  url: string;
  publishableKey: string;
};

/**
 * Kiểm tra cấu hình public của Supabase. Chỉ nhận URL và publishable key (an toàn khi lộ ra
 * trình duyệt); secret/service-role key không bao giờ đi qua module này.
 */
export function parseSupabasePublicEnv(raw: {
  url: string | undefined;
  publishableKey: string | undefined;
}): SupabasePublicEnv {
  const url = raw.url?.trim();
  const publishableKey = raw.publishableKey?.trim();

  if (!url || !publishableKey) {
    throw new Error(
      "Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Chạy `npm run db:start` rồi `npm run db:env` để tạo .env.local.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL không phải URL hợp lệ.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL phải dùng http hoặc https.");
  }

  if (publishableKey.startsWith("sb_secret_")) {
    throw new Error("Không dùng secret key cho NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }

  return { url: parsed.origin, publishableKey };
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  // Tham chiếu trực tiếp process.env.NEXT_PUBLIC_* để Next.js nhúng giá trị vào bundle client.
  return parseSupabasePublicEnv({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
