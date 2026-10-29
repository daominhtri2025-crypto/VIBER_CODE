import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi } from './route-harness.mjs';
import { ownerCookie } from './auth-helper.mjs';

// Kiểm thử nhóm đọc video (shared/video-service.ts): thứ tự danh sách theo bài, danh sách rỗng,
// và bài chưa có video trả 404. Dùng SQLite thật và route thật (CLAUDE.md mục 7).

const ORIGIN = 'https://site.test';
const YOUTUBE_ID = 'dQw4w9WgXcQ';
const owner = { id: 'owner', email: 'owner@example.test' };

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
applyMigrations(sql);
const deletedKeys = [];
const bucket = { delete: async (key) => { deletedKeys.push(key); } };
const api = await loadApi(sql, { bucket });
owner.cookie = await ownerCookie(api);

function request(method, path, identity, json) {
  const headers = {};
  if (identity?.cookie) {
    headers.cookie = identity.cookie;
  } else if (identity?.id) {
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

// 5) Thay tệp bằng liên kết (quy tắc 4.5): tệp R2 cũ bị xóa đúng một lần; bản ghi thành liên kết.
{
  sql.prepare("INSERT INTO videos(lesson,key,mime,duration,updated,kind,url) VALUES(?,?,?,?,?,'file',NULL)")
    .run(6, 'videos/6/old-file', 'video/mp4', 30, '2026-10-01T00:00:00.000Z');
  const response = await api.POST(request('POST', 'video-link', owner, { lesson: 6, url: `https://www.youtube.com/watch?v=${YOUTUBE_ID}` }));
  assert.equal(response.status, 200);
  assert.deepEqual(deletedKeys, ['videos/6/old-file'], 'tệp R2 cũ phải bị xóa đúng một lần');
  const row = sql.prepare('SELECT kind,key,url FROM videos WHERE lesson=6').get();
  assert.equal(row.kind, 'link');
  assert.equal(row.key, '');
}

// 6) Thay liên kết bằng liên kết (không có tệp cũ): không gọi xóa R2.
{
  deletedKeys.length = 0;
  const response = await api.POST(request('POST', 'video-link', owner, { lesson: 4, url: `https://youtu.be/${YOUTUBE_ID}` }));
  assert.equal(response.status, 200);
  assert.deepEqual(deletedKeys, [], 'không có tệp cũ thì không được xóa R2');
}

console.log('PASS: dịch vụ video: danh sách rỗng, sắp theo bài, 404 khi không có video, thay tệp bằng liên kết xóa đúng tệp cũ');
