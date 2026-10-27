import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi } from './route-harness.mjs';

// Kiểm thử API GET /api/dashboard với báo cáo lọc (Bước 4; FR-DSH-01 đến 06; FR-OBS-05).
// Chạy route.ts thật trên SQLite thật (CLAUDE.md mục 7). Dữ liệu được chèn trực tiếp để mọi kết quả tính tay được.
// Múi giờ: 16:59:59.999Z = 23:59 ngày 26/10 (VN); 18:00Z = 01:00 ngày 27/10 (VN).

const ORIGIN = 'https://site.test';
const OWNER = { id: 'api-owner', email: 'owner@example.test' };
const VOLUNTEER = { id: 'api-vol', email: 'vol@test.test' };
const LEARNER = { id: 'api-l1', email: 'l1@test.test' };

function request(path, who = {}) {
  const headers = {};
  if (who.id) {
    headers['oai-authenticated-user-id'] = who.id;
    headers['oai-authenticated-user-email'] = who.email;
  }
  return new Request(`${ORIGIN}/api/${path}`, { method: 'GET', headers });
}

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
applyMigrations(sql);
const api = await loadApi(sql);
const get = (path, who) => api.GET(request(path, who));
const getJson = async (path, who = OWNER) => {
  const res = await get(path, who);
  return { status: res.status, headers: res.headers, body: await res.json() };
};

// Dữ liệu cố định: học viên L1 và L2, lượt làm, hoàn thành và phiếu đánh giá.
sql.prepare("INSERT INTO staff(email, created) VALUES (?, ?)").run(VOLUNTEER.email, '2026-10-01T00:00:00.000Z');
sql.prepare('INSERT INTO learners(id, code, created) VALUES (?, ?, ?)').run('api-l1', 'ST-API-1', '2026-10-01T00:00:00.000Z');
sql.prepare('INSERT INTO learners(id, code, created) VALUES (?, ?, ?)').run('api-l2', 'ST-API-2', '2026-10-01T00:00:00.000Z');
const attempt = sql.prepare('INSERT INTO quiz_attempts(id, learner, lesson, choice, correct, client_id, created) VALUES (?, ?, ?, ?, ?, ?, ?)');
attempt.run('qa-1', 'api-l1', 0, 1, 1, 'api-client-0001', '2026-10-26T16:59:59.999Z');
attempt.run('qa-2', 'api-l1', 1, 0, 0, 'api-client-0002', '2026-10-26T18:00:00.000Z');
attempt.run('qa-3', 'api-l1', 2, 1, 1, 'api-client-0003', '2026-10-27T01:00:00.000Z');
attempt.run('qa-4', 'api-l2', 3, 0, 0, 'api-client-0004', '2026-10-27T03:00:00.000Z');
const progress = sql.prepare('INSERT INTO progress(learner, lesson, read, done, score, updated, completed_at) VALUES (?, ?, 1, ?, 0, ?, ?)');
progress.run('api-l1', 0, 1, '2026-10-27T02:00:00.000Z', '2026-10-27T02:00:00.000Z');
progress.run('api-l1', 1, 0, '2026-10-27T02:00:00.000Z', null);
const groupOf = new Map(sql.prepare('SELECT lesson, group_no FROM lessons').all().map((row) => [row.lesson, row.group_no]));
const lessonsInGroup = (group) => [...groupOf].filter(([, g]) => g === group).map(([lesson]) => lesson).sort((x, y) => x - y);

// 1) Phân quyền (FR-OBS-05): chỉ quản trị viên; tình nguyện viên, học viên và khách đều 403.
{
  assert.equal((await getJson('dashboard', VOLUNTEER)).status, 403, 'tình nguyện viên không xem được báo cáo');
  assert.equal((await getJson('dashboard', LEARNER)).status, 403, 'học viên không xem được báo cáo');
  assert.equal((await getJson('dashboard', {})).status, 403, 'khách không xem được báo cáo');
}

// 2) Không tham số: mặc định không lọc, theo ngày; phản hồi không-lưu-đệm; trường cũ vẫn có để giao diện hiện tại không lỗi.
{
  const res = await getJson('dashboard');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(res.body.report.filter, { from: null, to: null, lesson: null, group: null, granularity: 'day' });
  for (const key of ['learners', 'assessments', 'staff', 'at']) assert.ok(key in res.body, `thiếu trường cũ ${key}`);
  assert.equal(res.body.report.lessons.length, 10);
}

// 3) Báo cáo theo học viên: chỉ có mã học viên, không lộ id hay email; ngưỡng đạt tính trên toàn bộ bài.
{
  const { report } = (await getJson('dashboard')).body;
  const l1 = report.learners.find((row) => row.code === 'ST-API-1');
  assert.deepEqual(Object.keys(l1).sort(), ['attempted', 'code', 'correctLessons', 'quiz']);
  assert.equal(l1.attempted, 3, 'bài 0, 1, 2 đã làm');
  assert.equal(l1.correctLessons, 2, 'bài 0 và 2 có lượt đúng');
  assert.equal(l1.quiz.status, 'chua_dat', '2/10 bài không đạt ngưỡng 70%');
  assert.equal(JSON.stringify(report).includes('api-l1'), false, 'không lộ id học viên');
  assert.equal(JSON.stringify(report).includes('l1@test.test'), false, 'không lộ email học viên');
}

// 4) Chuỗi theo ngày theo giờ Việt Nam: lượt 16:59:59.999Z thuộc 26/10; hoàn thành 02:00Z thuộc 27/10.
{
  const { series } = (await getJson('dashboard')).body.report;
  assert.deepEqual(series, [
    { period: '2026-10-26', attempts: 1, correct: 1, completions: 0 },
    { period: '2026-10-27', attempts: 3, correct: 1, completions: 1 },
  ]);
}

// 5) Lọc theo bài: chỉ bài được chọn, chuỗi chỉ tính lượt của bài đó; ngưỡng đạt của học viên không đổi.
{
  const { report } = (await getJson('dashboard?lesson=1')).body;
  assert.deepEqual(report.lessons.map((row) => row.lesson), [1]);
  assert.deepEqual(report.series, [{ period: '2026-10-27', attempts: 1, correct: 0, completions: 0 }], 'bài 1 chưa hoàn thành');
  const l1 = report.learners.find((row) => row.code === 'ST-API-1');
  assert.equal(l1.attempted, 3, 'bộ lọc bài không được làm giảm số bài đã làm của học viên');
  assert.equal(l1.quiz.status, 'chua_dat');
}

// 6) Lọc theo nhóm: mọi bài trả về thuộc nhóm đã chọn, đúng số bài trong DB.
{
  const { report } = (await getJson('dashboard?group=1')).body;
  assert.deepEqual(report.lessons.map((row) => row.lesson), lessonsInGroup(1));
  assert.ok(report.groups.every((row) => row.group === 1));
}

// 7) Lọc theo khoảng thời gian (hai đầu bao gồm): chỉ lượt và hoàn thành trong ngày 27/10 (VN).
{
  const from = encodeURIComponent('2026-10-26T17:00:00.000Z');
  const to = encodeURIComponent('2026-10-27T17:00:00.000Z');
  const { report } = (await getJson(`dashboard?from=${from}&to=${to}`)).body;
  assert.equal(report.filter.from, '2026-10-26T17:00:00.000Z');
  assert.deepEqual(report.series, [{ period: '2026-10-27', attempts: 3, correct: 1, completions: 1 }], 'lượt 16:59:59.999Z của 26/10 bị loại');
}

// 8) Kỳ theo tuần: 26/10 và 27/10 (VN) cùng một tuần ISO, nên chỉ có một điểm.
{
  const { report } = (await getJson('dashboard?granularity=week')).body;
  assert.equal(report.series.length, 1);
  assert.match(report.series[0].period, /^\d{4}-W\d{2}$/);
  assert.deepEqual({ ...report.series[0], period: undefined }, { period: undefined, attempts: 4, correct: 2, completions: 1 });
}

// 9) Tham số sai trả 400 với thông báo tiếng Việt, không chạy truy vấn báo cáo.
{
  const bad = [
    'lesson=42', 'lesson=abc', 'lesson=-1', 'group=6', 'group=1.5',
    'granularity=month', 'from=2026-10-27', 'from=2026-10-28T00:00:00.000Z&to=2026-10-27T00:00:00.000Z',
  ];
  for (const query of bad) {
    const res = await getJson(`dashboard?${query}`);
    assert.equal(res.status, 400, `${query} phải trả 400`);
    assert.ok(typeof res.body.error === 'string' && res.body.error.length > 0, `${query} phải có thông báo lỗi`);
  }
}

// 10) Tham số rỗng nghĩa là không lọc (giao diện gửi khi người dùng bỏ trống ô lọc).
{
  const { report } = (await getJson('dashboard?lesson=&group=&from=&to=&granularity=day')).body;
  assert.equal(report.filter.lesson, null);
  assert.equal(report.filter.group, null);
  assert.equal(report.lessons.length, 10);
}

console.log('PASS: API báo cáo quản trị: 403 cho tình nguyện viên và học viên, lọc bài/nhóm/khoảng thời gian/kỳ, 400 cho tham số sai, mốc múi giờ, không lộ danh tính, giữ trường cũ');
