import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi, loadShared } from './route-harness.mjs';

// Kiểm thử giới hạn đọc thân yêu cầu (shared/body-limit.ts; CLAUDE.md mục 2B.2, 2B.11, 7).
// Mục tiêu: vượt giới hạn thì dừng đọc sớm, không tin Content-Length, và upload-video trả 413 mà không đọc hết.

const { readBodyWithLimit } = await loadShared('body-limit');
const ORIGIN = 'https://site.test';

// Luồng sinh từng đoạn khi được kéo, đếm số lần kéo và ghi nhận khi bị hủy.
function chunkedStream(chunkCount, chunkSize) {
  const state = { pulls: 0, cancelled: false };
  const stream = new ReadableStream({
    pull(controller) {
      if (state.pulls >= chunkCount) return controller.close();
      state.pulls += 1;
      controller.enqueue(new Uint8Array(chunkSize).fill(state.pulls % 256));
    },
    cancel() {
      state.cancelled = true;
    },
  }, { highWaterMark: 0 }); // Không prefetch: mỗi đoạn chỉ được sinh khi bộ đọc yêu cầu.
  return { stream, state };
}

function requestWith(stream, headers = {}) {
  return new Request(`${ORIGIN}/api/upload-video`, { method: 'POST', headers, body: stream, duplex: 'half' });
}

// 1) Thân nhỏ hơn giới hạn: đọc đủ, byte giữ nguyên.
{
  const { stream } = chunkedStream(3, 10);
  const result = await readBodyWithLimit(requestWith(stream), 100);
  assert.equal(result.ok, true);
  assert.equal(result.body.byteLength, 30);
}

// 2) Đúng bằng giới hạn: vẫn chấp nhận.
{
  const { stream } = chunkedStream(10, 10);
  const result = await readBodyWithLimit(requestWith(stream), 100);
  assert.equal(result.ok, true, 'đúng bằng giới hạn phải được chấp nhận');
  assert.equal(result.body.byteLength, 100);
}

// 3) Vượt giới hạn dù không có Content-Length: hủy luồng ngay khi vượt, không đọc tiếp.
{
  const { stream, state } = chunkedStream(1000, 10);
  const result = await readBodyWithLimit(requestWith(stream), 100);
  assert.deepEqual(result, { ok: false });
  assert.equal(state.cancelled, true, 'phải hủy luồng khi vượt giới hạn');
  assert.ok(state.pulls <= 11, `chỉ được đọc tới khi vượt, đã đọc ${state.pulls} đoạn`);
}

// 4) Content-Length khai báo nhỏ nhưng thân thật lớn: vẫn bị đếm và từ chối.
{
  const { stream, state } = chunkedStream(1000, 10);
  const result = await readBodyWithLimit(requestWith(stream, { 'content-length': '5' }), 100);
  assert.deepEqual(result, { ok: false }, 'không được tin Content-Length nhỏ');
  assert.equal(state.cancelled, true);
}

// 5) Content-Length khai báo lớn hơn giới hạn: từ chối ngay, không đọc đoạn nào.
{
  const { stream, state } = chunkedStream(1000, 10);
  const result = await readBodyWithLimit(requestWith(stream, { 'content-length': '5000' }), 100);
  assert.deepEqual(result, { ok: false });
  assert.equal(state.pulls, 0, 'khai báo quá lớn thì không được đọc gì');
}

// 6) Không có thân yêu cầu: trả rỗng, không lỗi.
{
  const result = await readBodyWithLimit(new Request(`${ORIGIN}/api/x`, { method: 'POST' }), 100);
  assert.equal(result.ok, true);
  assert.equal(result.body.byteLength, 0);
}

// 7) Cấp route: upload-video với thân 60 đoạn x 1 MB (vượt 27 MB) trả 413, không ghi R2, và không đọc hết.
{
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sql);
  const puts = [];
  const api = await loadApi(sql, { bucket: { put: async (key) => { puts.push(key); }, delete: async () => {} } });
  const { stream, state } = chunkedStream(60, 1024 * 1024);
  const response = await api.POST(new Request(`${ORIGIN}/api/upload-video`, {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      'oai-authenticated-user-id': 'owner',
      'oai-authenticated-user-email': 'owner@example.test',
      'content-type': 'multipart/form-data; boundary=x',
    },
    body: stream,
    duplex: 'half',
  }));
  assert.equal(response.status, 413);
  assert.deepEqual(puts, [], 'thân vượt giới hạn không được ghi R2');
  assert.equal(state.cancelled, true);
  assert.ok(state.pulls <= 29, `route phải dừng sớm, đã đọc ${state.pulls}/60 đoạn`);
}

console.log('PASS: giới hạn đọc thân: đếm byte khi đọc, không tin Content-Length, hủy luồng khi vượt, upload-video trả 413 không đọc hết');
