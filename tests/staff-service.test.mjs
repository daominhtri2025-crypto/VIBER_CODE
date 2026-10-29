import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi } from './route-harness.mjs';
import { ownerCookie, volunteerCookie } from './auth-helper.mjs';

// Kiểm thử dịch vụ phân quyền tình nguyện viên (FR-ADM; CLAUDE.md mục 7): chạy route.ts thật trên SQLite thật.
// Bổ sung cho api.test.mjs: email sai, body hỏng, chuẩn hóa chữ hoa, khoảng trắng bị từ chối, thêm lại không trùng, thu hồi, cross-origin.

const ORIGIN = 'https://site.test';
const OWNER = { id: 'st-owner', email: 'owner@example.test' };
const VOLUNTEER = { id: 'st-vol', email: 'vol@test.test' };

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
applyMigrations(sql);
const api = await loadApi(sql, { ownerEmail: OWNER.email });
OWNER.cookie = await ownerCookie(api);
VOLUNTEER.cookie = await volunteerCookie(api, VOLUNTEER.email);
// Kiểm thử này chỉ kiểm tra quyền của /api/staff; xóa dòng staff tự tạo để staffEmails() bắt đầu rỗng như trước.
sql.prepare('DELETE FROM staff').run();

function post(body, who = OWNER, { origin = ORIGIN, raw } = {}) {
  const headers = { origin, 'Content-Type': 'application/json' };
  if (who?.cookie) {
    headers.cookie = who.cookie;
  } else if (who?.id) {
    headers['oai-authenticated-user-id'] = who.id;
    headers['oai-authenticated-user-email'] = who.email;
  }
  return api.POST(new Request(`${ORIGIN}/api/staff`, { method: 'POST', headers, body: raw ?? JSON.stringify(body) }));
}
const staffEmails = () => sql.prepare('SELECT email FROM staff ORDER BY email').all().map((row) => row.email);

// 1) Chỉ quản trị viên được thêm hoặc thu hồi quyền; tình nguyện viên và khách không được.
{
  assert.equal((await post({ email: 'x@test.test' }, VOLUNTEER)).status, 403);
  assert.equal((await post({ email: 'x@test.test' }, null)).status, 401);
  assert.deepEqual(staffEmails(), [], 'yêu cầu bị từ chối không được ghi');
}

// 2) Cross-origin bị chặn trước mọi kiểm tra khác (NFR-SEC-03).
{
  assert.equal((await post({ email: 'x@test.test' }, OWNER, { origin: 'https://evil.test' })).status, 403);
}

// 3) Email sai định dạng, quá dài, hoặc body hỏng đều trả 400 và không ghi.
{
  for (const body of [{ email: 'khong-phai-email' }, { email: 'a b@test.test' }, { email: `${'a'.repeat(250)}@t.test` }, {}]) {
    const res = await post(body);
    assert.equal(res.status, 400, `phải từ chối ${JSON.stringify(body).slice(0, 40)}`);
    assert.equal((await res.json()).error, 'Email không hợp lệ');
  }
  assert.equal((await post(null, OWNER, { raw: 'null' })).status, 400, 'body null phải trả 400, không phải 503');
  assert.equal((await post(null, OWNER, { raw: '{chưa-đóng' })).status, 400, 'JSON hỏng phải trả 400');
  assert.deepEqual(staffEmails(), [], 'không có bản ghi nào được tạo từ yêu cầu sai');
}

// 4) Thêm: email được chuẩn hóa về chữ thường; khoảng trắng bao quanh bị từ chối (regex trên chuỗi thô, như trước);
//    thêm lại không tạo bản ghi thứ hai.
{
  assert.equal((await post({ email: ' New.Person@Test.TEST' })).status, 400, 'khoảng trắng đầu phải bị từ chối');
  assert.equal((await post({ email: 'New.Person@Test.TEST' })).status, 200);
  assert.equal((await post({ email: 'new.person@test.test' })).status, 200, 'thêm lại vẫn trả 200');
  assert.deepEqual(staffEmails(), ['new.person@test.test']);
}

// 5) Thu hồi: xóa đúng email; thu hồi email không tồn tại vẫn trả 200 và không ảnh hưởng bản ghi khác.
{
  assert.equal((await post({ email: 'other@test.test' })).status, 200);
  assert.equal((await post({ email: 'NEW.PERSON@test.test', remove: true })).status, 200);
  assert.equal((await post({ email: 'missing@test.test', remove: true })).status, 200);
  assert.deepEqual(staffEmails(), ['other@test.test']);
}

console.log('PASS: phân quyền tình nguyện viên: chỉ quản trị viên, chặn cross-origin, email và body sai trả 400, chuẩn hóa chữ hoa, khoảng trắng bị từ chối, thêm lại không trùng, thu hồi đúng email');
