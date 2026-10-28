// Đọc thân yêu cầu có giới hạn byte (CLAUDE.md mục 2B.2 và 9.9). Không tin Content-Length do client khai báo:
// đếm byte khi đọc luồng, vượt giới hạn thì hủy luồng ngay, để bộ nhớ bị chặn ở mức giới hạn chứ không theo kích thước client gửi.
// Header Content-Length chỉ dùng để từ chối sớm khi đã khai báo quá lớn, không đọc gì cả.
export type BodyReadResult = { ok: true; body: Uint8Array } | { ok: false };

export async function readBodyWithLimit(req: Request, limit: number): Promise<BodyReadResult> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > limit) return { ok: false };
  if (!req.body) return { ok: true, body: new Uint8Array(0) };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body };
}
