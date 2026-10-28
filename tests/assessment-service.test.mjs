import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi } from './route-harness.mjs';

// Kiểm thử dịch vụ ghi phiếu quan sát qua route.ts thật trên SQLite thật (CLAUDE.md mục 7).
// Bổ sung cho assessment-idempotency.test.mjs: 403, 404 khi mã học viên không có, chuẩn hóa mã, phát lại không tạo bản mới.

const ORIGIN = 'https://site.test';
const VOLUNTEER = { id: 'as-vol', email: 'vol@test.test' };
const LEARNER = { id: 'as-learner', email: 'learner@test.test' };

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
applyMigrations(sql);
const api = await loadApi(sql);
sql.prepare('INSERT INTO staff(email, created) VALUES (?, ?)').run(VOLUNTEER.email, '2026-10-01T00:00:00.000Z');
sql.prepare('INSERT INTO learners(id, code, created) VALUES (?, ?, ?)').run(LEARNER.id, 'ST-AS-1', '2026-10-01T00:00:00.000Z');

const CLIENT = 'as-client-0001';
function post(who, body) {
  const headers = { origin: ORIGIN, 'Content-Type': 'application/json' };
  if (who?.id) {
    headers['oai-authenticated-user-id'] = who.id;
    headers['oai-authenticated-user-email'] = who.email;
  }
  return api.POST(new Request(`${ORIGIN}/api/assessment`, { method: 'POST', headers, body: JSON.stringify(body) }));
}
const draftOf = (code, extra = {}) => ({ client_id: CLIENT, code, phase: 'Trước học', scores: [3, 2, 1, 0, null], observed: true, ...extra });
const countFor = (clientId) => sql.prepare('SELECT COUNT(*) AS n FROM assessments WHERE client_id = ?').get(clientId).n;

// 1) Chỉ người đánh giá được cấp quyền; học viên thường nhận 403 và không có bản ghi nào được tạo.
{
  assert.equal((await post(LEARNER, draftOf('ST-AS-1'))).status, 403);
  assert.equal(countFor(CLIENT), 0);
}

// 2) Mã học viên không tồn tại: 404, không tạo bản ghi (không đoán mã).
{
  const res = await post(VOLUNTEER, draftOf('ST-KHONG-CO'));
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'Không tìm thấy mã học viên. Học viên cần đăng nhập trước.');
  assert.equal(countFor(CLIENT), 0);
}

// 3) Mã được chuẩn hóa như khi đăng nhập (bỏ khoảng trắng, viết hoa): lưu thành công và gắn đúng học viên.
{
  const res = await post(VOLUNTEER, draftOf('  st-as-1 '));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.created, true);
  const row = sql.prepare('SELECT learner, assessor FROM assessments WHERE id = ?').get(body.id);
  assert.equal(row.learner, LEARNER.id);
  assert.equal(row.assessor, VOLUNTEER.email, 'người đánh giá lấy từ danh tính đã xác thực, không lấy từ body');
}

// 4) Gửi lại cùng client_id và cùng nội dung: trả created false cùng id cũ, không tạo bản thứ hai.
{
  const first = await (await post(VOLUNTEER, draftOf('ST-AS-1'))).json();
  const replay = await post(VOLUNTEER, draftOf('ST-AS-1'));
  assert.equal(replay.status, 200);
  const body = await replay.json();
  assert.equal(body.created, false);
  assert.equal(body.id, first.id);
  assert.equal(countFor(CLIENT), 1);
}

console.log('PASS: dịch vụ phiếu quan sát: chỉ người đánh giá, mã học viên không có trả 404, chuẩn hóa mã, người đánh giá lấy từ danh tính, phát lại không tạo bản mới');
