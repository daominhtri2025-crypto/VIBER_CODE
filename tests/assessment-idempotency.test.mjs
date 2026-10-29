import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi } from './route-harness.mjs';
import { ownerCookie, volunteerCookie } from './auth-helper.mjs';

// Kiểm thử FR-OBS-04 và quy tắc 4.2, 4.3 (CLAUDE.md mục 4, 7).
// Lỗi tái hiện: trước commit 1.3, gửi lại cùng phiếu tạo hai bản ghi trùng.

const ORIGIN = 'https://site.test';
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
applyMigrations(sql);
const api = await loadApi(sql);

const call = (method, path, identity, body) => {
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
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const request = new Request(`${ORIGIN}/api/${path}`, init);
  return method === 'GET' ? api.GET(request) : api.POST(request);
};

const owner = { id: 'owner', email: 'owner@example.test' };
const volunteer = { id: 'vol-1', email: 'v1@test.test' };
const otherVolunteer = { id: 'vol-2', email: 'v2@test.test' };
const learner = { id: 'learner-1', email: 'hv1@test.test' };
const otherLearner = { id: 'learner-2', email: 'hv2@test.test' };
owner.cookie = await ownerCookie(api);
volunteer.cookie = await volunteerCookie(api, volunteer.email);
otherVolunteer.cookie = await volunteerCookie(api, otherVolunteer.email);

// Thiết lập: tạo hai học viên (qua /api/me) và cấp quyền cho hai tình nguyện viên.
const learnerCode = (await (await call('GET', 'me', learner)).json()).code;
const otherLearnerCode = (await (await call('GET', 'me', otherLearner)).json()).code;
for (const email of [volunteer.email, otherVolunteer.email]) {
  assert.equal((await call('POST', 'staff', owner, { email })).status, 200);
}

const CLIENT_ID = 'phieu-test-0001';
const assessment = (overrides = {}) => ({
  client_id: CLIENT_ID,
  code: learnerCode,
  phase: 'Trước học',
  scores: [0, 1, 2, 3, null],
  observed: true,
  ...overrides,
});
const countRows = (clientId, learnerId = learner.id) =>
  sql.prepare('SELECT COUNT(*) AS n FROM assessments WHERE client_id = ? AND learner = ?').get(clientId, learnerId).n;
const storedRow = (clientId, learnerId = learner.id) =>
  ({ ...sql.prepare('SELECT id, phase, scores, assessor FROM assessments WHERE client_id = ? AND learner = ?').get(clientId, learnerId) });

// 1) Thiếu hoặc sai định dạng client_id: 400, không ghi gì.
{
  const withoutId = assessment();
  delete withoutId.client_id;
  assert.equal((await call('POST', 'assessment', volunteer, withoutId)).status, 400, 'thiếu client_id phải trả 400');
  assert.equal((await call('POST', 'assessment', volunteer, assessment({ client_id: '../etc' }))).status, 400, 'client_id có ký tự lạ phải trả 400');
  assert.equal((await call('POST', 'assessment', volunteer, assessment({ client_id: 'short' }))).status, 400, 'client_id quá ngắn phải trả 400');
  assert.equal(countRows(CLIENT_ID), 0, 'không được ghi phiếu khi client_id không hợp lệ');
}

// 2) Tái hiện lỗi: gửi lại cùng phiếu không được tạo bản ghi trùng.
{
  const first = await call('POST', 'assessment', volunteer, assessment());
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.created, true);

  const retry = await call('POST', 'assessment', volunteer, assessment());
  assert.equal(retry.status, 200, 'gửi lại cùng nội dung phải trả 200');
  const retryBody = await retry.json();
  assert.equal(retryBody.created, false);
  assert.equal(retryBody.id, firstBody.id, 'phải trả về bản ghi cũ');
  assert.equal(countRows(CLIENT_ID), 1, 'chỉ được có một bản ghi cho client_id này');
}

// 3) Cùng client_id, người đánh giá khác, cùng nội dung: vẫn là một phiếu (đã duyệt câu 1).
{
  const response = await call('POST', 'assessment', otherVolunteer, assessment());
  assert.equal(response.status, 200);
  assert.equal(countRows(CLIENT_ID), 1);
  assert.equal(storedRow(CLIENT_ID).assessor, volunteer.email, 'người đánh giá gốc được giữ nguyên');
}

// 4) Cùng client_id, khác scores: 409, không ghi đè (đã duyệt câu 2).
{
  const response = await call('POST', 'assessment', volunteer, assessment({ scores: [3, 3, 3, 3, 3] }));
  assert.equal(response.status, 409, 'khác scores phải trả 409');
  assert.deepEqual(JSON.parse(storedRow(CLIENT_ID).scores), [0, 1, 2, 3, null], 'bản ghi cũ không được ghi đè');
  assert.equal(countRows(CLIENT_ID), 1);
}

// 5) Cùng client_id, khác phase: 409.
{
  const response = await call('POST', 'assessment', volunteer, assessment({ phase: 'Sau học' }));
  assert.equal(response.status, 409, 'khác phase phải trả 409');
  assert.equal(storedRow(CLIENT_ID).phase, 'Trước học');
}

// 6) Quy tắc 4.2: null (chưa đánh giá) khác 0. Cùng client_id, đổi null thành 0 phải bị 409.
{
  const response = await call('POST', 'assessment', volunteer, assessment({ scores: [0, 1, 2, 3, 0] }));
  assert.equal(response.status, 409, 'null khác 0 nên phải trả 409');
  assert.equal(JSON.parse(storedRow(CLIENT_ID).scores)[4], null, 'null không được chuyển thành 0');
}

// 7) Khóa là (learner, client_id): học viên khác dùng cùng client_id vẫn tạo phiếu riêng.
{
  const response = await call('POST', 'assessment', volunteer, assessment({ code: otherLearnerCode }));
  assert.equal(response.status, 200);
  assert.equal(countRows(CLIENT_ID, otherLearner.id), 1);
  assert.equal(countRows(CLIENT_ID, learner.id), 1, 'phiếu của học viên đầu không bị ảnh hưởng');
}

// 8) Quyền vẫn được kiểm tra trước idempotency: học viên thường không ghi được phiếu.
{
  const response = await call('POST', 'assessment', learner, assessment({ client_id: 'phieu-test-0002' }));
  assert.equal(response.status, 403);
  assert.equal(countRows('phieu-test-0002'), 0);
}

console.log('PASS: idempotency phiếu quan sát theo (learner, client_id), 409 khi khác nội dung, 400 khi thiếu client_id, null khác 0, khóa theo học viên, kiểm tra quyền');
