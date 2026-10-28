import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi } from './route-harness.mjs';

// Kiểm thử quy tắc hợp nhất tiến độ (CLAUDE.md mục 4.1, 7) qua route.ts thật trên SQLite thật.
// Bổ sung cho progress.test.mjs: đồng bộ gửi lại chỉ có read (không có done) không được hạ done;
// đồng bộ với done rồi read không được hạ read; hai thiết bị ghi xen kẽ thì lấy giá trị lớn nhất.

const ORIGIN = 'https://site.test';
const A = { id: 'ps-a', email: 'a@test.test' };

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
applyMigrations(sql);
const api = await loadApi(sql);

const get = (path, who) => {
  const headers = {};
  if (who?.id) {
    headers['oai-authenticated-user-id'] = who.id;
    headers['oai-authenticated-user-email'] = who.email;
  }
  return api.GET(new Request(`${ORIGIN}/api/${path}`, { headers }));
};
const post = (path, who, body) => api.POST(new Request(`${ORIGIN}/api/${path}`, {
  method: 'POST',
  headers: { origin: ORIGIN, 'Content-Type': 'application/json', 'oai-authenticated-user-id': who.id, 'oai-authenticated-user-email': who.email },
  body: JSON.stringify(body),
}));
const code = (await (await get('me', A)).json()).code;
const rowOf = async (lesson) => {
  const body = await (await get('me', A)).json();
  return body.progress.find((row) => row.lesson === lesson);
};

// 1) Đồng bộ đánh dấu done rồi đồng bộ chỉ đọc: done phải giữ 1 (MAX, quy tắc 4.1).
{
  assert.equal((await post('progress', A, { code, read: [2], done: [2] })).status, 200);
  assert.equal((await post('progress', A, { code, read: [2], done: [] })).status, 200);
  const row = await rowOf(2);
  assert.equal(row.done, 1, 'đồng bộ không có done không được hạ done về 0');
  assert.equal(row.read, 1);
}

// 2) Đồng bộ với read rỗng nhưng done có giá trị: read đã đọc trước đó không được hạ về 0.
{
  assert.equal((await post('progress', A, { code, read: [5], done: [5] })).status, 200);
  assert.equal((await post('progress', A, { code, read: [], done: [5] })).status, 200);
  const row = await rowOf(5);
  assert.equal(row.read, 1, 'read phải giữ 1 khi đồng bộ sau không gửi read');
  assert.equal(row.done, 1);
}

// 3) Hai thiết bị ghi xen kẽ: bài 7 đã đọc trên thiết bị 1, đánh dấu xong trên thiết bị 2, rồi thiết bị 1 gửi lại chỉ read.
{
  assert.equal((await post('progress', A, { code, read: [7], done: [] })).status, 200);
  assert.equal((await post('progress', A, { code, read: [], done: [7] })).status, 200);
  assert.equal((await post('progress', A, { code, read: [7], done: [] })).status, 200);
  const row = await rowOf(7);
  assert.equal(row.done, 1, 'thiết bị cũ gửi lại không được làm mất hoàn thành');
  assert.equal(row.read, 1);
}

// 4) Đồng bộ rỗng không làm thay đổi dòng nào (no-op).
{
  const before = JSON.stringify((await (await get('me', A)).json()).progress);
  assert.equal((await post('progress', A, { code, read: [], done: [] })).status, 200);
  assert.equal(JSON.stringify((await (await get('me', A)).json()).progress), before);
}

console.log('PASS: tiến độ (dịch vụ): done và read hợp nhất theo giá trị lớn nhất qua nhiều lần đồng bộ, không hạ khi gửi lại từ thiết bị cũ, đồng bộ rỗng không đổi dữ liệu');
