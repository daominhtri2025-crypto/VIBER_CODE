import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi } from './route-harness.mjs';

// Kiểm thử nhóm đọc video (shared/video-service.ts): thứ tự danh sách theo bài, danh sách rỗng,
// và bài chưa có video trả 404. Dùng SQLite thật và route thật (CLAUDE.md mục 7).

const ORIGIN = 'https://site.test';
const YOUTUBE_ID = 'dQw4w9WgXcQ';
const owner = { id: 'owner', email: 'owner@example.test' };

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
applyMigrations(sql);
const api = await loadApi(sql, { bucket: {} });

function request(method, path, identity, json) {
  const headers = {};
  if (identity) {
    headers['oai-authenticated-user-id'] = identity.id;
    headers['oai-authenticated-user-email'] = identity.email;
  }
  if (method === 'POST') {
    headers.origin = ORIGIN;
    headers['Content-Type'] = 'application/json';
  }
  return new Request(`${ORIGIN}/api/${path}`, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) });
}

// 1) Chưa có video: danh sách rỗng, không lỗi.
{
  const response = await api.GET(request('GET', 'videos'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
}

// 2) Thêm liên kết cho bài 4 rồi bài 1: GET /api/videos phải trả theo thứ tự bài tăng dần, không theo thứ tự chèn.
{
  for (const lesson of [4, 1]) {
    const response = await api.POST(request('POST', 'video-link', owner, { lesson, url: `https://www.youtube.com/watch?v=${YOUTUBE_ID}` }));
    assert.equal(response.status, 200, `lưu liên kết bài ${lesson} phải thành công`);
  }
  const rows = await (await api.GET(request('GET', 'videos'))).json();
  assert.deepEqual(rows.map((row) => row.lesson), [1, 4], 'danh sách video phải sắp theo bài tăng dần');
  assert.equal(rows[0].kind, 'link');
}

// 3) Bài không có video: stream trả 404 (không đọc R2).
{
  const response = await api.GET(request('GET', 'video/7', owner));
  assert.equal(response.status, 404);
}

// 4) Bài dùng liên kết không phát qua /api/video/:lesson (kind !== 'file').
{
  const response = await api.GET(request('GET', 'video/4', owner));
  assert.equal(response.status, 404);
}

console.log('PASS: nhóm đọc video (dịch vụ): danh sách rỗng, sắp theo bài, bài không có video trả 404');
