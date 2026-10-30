// Giới hạn số yêu cầu trong một cửa sổ giờ theo khóa (SRS FR-AUTH-11; CLAUDE.md mục 2).
// Khóa dùng băm SHA-256 của IP, không lưu IP thô. Cửa sổ cố định theo giờ UTC.
import { sha256Hex, type AuthDb } from './auth-service';

// Trả true nếu yêu cầu này còn trong hạn mức, false nếu đã vượt.
// Một câu lệnh upsert có điều kiện: hai yêu cầu đồng thời không cùng qua được khi đã đủ hạn mức.
// Lỗi hoặc không có dòng trả về: từ chối (đóng theo hướng an toàn).
export async function consumeLimitSlot(
  db: AuthDb,
  scope: string,
  ip: string,
  limit: number,
  now: string,
): Promise<boolean> {
  const key = `${scope}:${await sha256Hex(ip)}`;
  const windowStart = `${now.slice(0, 13)}:00:00.000Z`;
  const row = await db
    .prepare(`INSERT INTO request_limits(key, window_start, count) VALUES(?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN request_limits.window_start = excluded.window_start THEN request_limits.count + 1 ELSE 1 END,
        window_start = excluded.window_start
      RETURNING count`)
    .bind(key, windowStart)
    .first<{ count: number }>();
  return row !== null && row.count <= limit;
}
