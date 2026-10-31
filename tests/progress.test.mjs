import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi, loadShared } from './route-harness.mjs';

// Kiểm thử Commit 1.6: tiến độ học tập (CLAUDE.md mục 4.1, 4.7, 7).
// Dùng SQLite thật qua migration, route.ts thật qua harness; không mock tầng dữ liệu.

const { validateComplete, buildCourseProgress, COURSE_ID } = await loadShared('progress-rules');
// Danh sách bài hiển thị trong kiểm thử: mã 0–9 (quyết định 30/10/2026).
const VISIBLE_TEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const buildFor = (rows) => buildCourseProgress(rows, VISIBLE_TEN);
const summary = (course) => ({ completed_lessons: course.completed_lessons, percent: course.percent });
const isoUtc = (value) => typeof value === 'string' && new Date(value).toISOString() === value;

// 1) Đầu vào của POST /api/progress/complete: số nguyên 0–9, mã không rỗng và không quá 40 ký tự.
for (const bad of [null, [], 'x', {}, { code: '', lesson: 0 }, { code: 'a'.repeat(41), lesson: 0 }, { code: 7, lesson: 1 },
  { code: 'ST-1', lesson: -1 }, { code: 'ST-1', lesson: 1000 }, { code: 'ST-1', lesson: 1.5 }, { code: 'ST-1', lesson: '1' }]) {
  assert.equal(validateComplete(bad).ok, false, `phải từ chối ${JSON.stringify(bad)}`);
}
assert.deepEqual(validateComplete({ code: 'ST-1', lesson: 9 }), { ok: true, value: { code: 'ST-1', lesson: 9 } });
assert.equal(COURSE_ID, 'son-tra-so');

// 2) Tính tiến độ khóa học (quy tắc: done = 1 mới là hoàn thành; dòng ngoài 0–9 bị bỏ qua; completed_at chỉ để hiển thị).
assert.deepEqual(summary(buildFor([])), { completed_lessons: 0, percent: 0 });
assert.deepEqual(summary(buildFor([{ lesson: 0, done: 0, completed_at: '2026-10-27T00:00:00.000Z' }])), { completed_lessons: 0, percent: 0 });
assert.deepEqual(summary(buildFor([{ lesson: 12, done: 1, completed_at: null }])), { completed_lessons: 0, percent: 0 });
assert.deepEqual(summary(buildFor([{ lesson: 1, done: 1, completed_at: null }])), { completed_lessons: 1, percent: 10 });
const allDone = Array.from({ length: 10 }, (_, lesson) => ({ lesson, done: 1, completed_at: null }));
assert.deepEqual(summary(buildFor(allDone)), { completed_lessons: 10, percent: 100 });
assert.equal(buildFor([]).lessons.length, 10, 'luôn trả đủ 10 bài');

// 3) API: phân quyền, đầu vào, idempotency, cô lập giữa học viên.
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
applyMigrations(sql);
const api = await loadApi(sql);

function request(path, id, email, body, origin = 'https://site.test') {
  const headers = {};
  if (id) { headers['oai-authenticated-user-id'] = id; headers['oai-authenticated-user-email'] = email; }
  if (body !== undefined) { headers.origin = origin; headers['Content-Type'] = 'application/json'; }
  return new Request('https://site.test/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const get = (p, id, email) => api.GET(request(p, id, email));
const post = (p, id, email, body, origin) => api.POST(request(p, id, email, body, origin));

const codeA = (await (await get('me', 'a', 'a@test')).json()).code;
const codeB = (await (await get('me', 'b', 'b@test')).json()).code;
assert.notEqual(codeA, codeB);

// Quyền truy cập
assert.equal((await get('progress/son-tra-so')).status, 401, 'đọc tiến độ khi chưa đăng nhập phải 401');
assert.equal((await get('progress/khong-ton-tai', 'a', 'a@test')).status, 404, 'khóa học sai id phải 404');
assert.equal((await post('progress/complete', null, null, { code: codeA, lesson: 0 })).status, 401);
assert.equal((await post('progress/complete', 'a', 'a@test', { code: codeA, lesson: 0 }, 'https://evil.test')).status, 403);

// Đầu vào và khớp mã học viên
assert.equal((await post('progress/complete', 'a', 'a@test', { code: codeA, lesson: 1000 })).status, 400);
assert.equal((await post('progress/complete', 'a', 'a@test', { code: codeA, lesson: 1.5 })).status, 400);
assert.equal((await post('progress/complete', 'a', 'a@test', { lesson: 1 })).status, 400);
assert.equal((await post('progress/complete', 'b', 'b@test', { code: codeA, lesson: 0 })).status, 409, 'không ghi hoàn thành thay học viên khác');

// Ghi nhận hoàn thành, idempotent: gọi lại không đổi completed_at hay updated.
const first = await post('progress/complete', 'a', 'a@test', { code: codeA, lesson: 3 });
assert.equal(first.status, 200);
const firstBody = await first.json();
assert.equal(firstBody.ok, true);
assert.equal(firstBody.lesson, 3);
assert.ok(isoUtc(firstBody.completed_at), 'completed_at phải là ISO 8601 UTC');
const rowBefore = { ...sql.prepare("SELECT updated,completed_at FROM progress WHERE learner='a' AND lesson=3").get() };
await new Promise((resolve) => setTimeout(resolve, 5));
const second = await (await post('progress/complete', 'a', 'a@test', { code: codeA, lesson: 3 })).json();
assert.equal(second.completed_at, firstBody.completed_at, 'gọi lại không đổi completed_at');
const rowAfter = { ...sql.prepare("SELECT updated,completed_at FROM progress WHERE learner='a' AND lesson=3").get() };
assert.deepEqual(rowAfter, rowBefore, 'gọi lại không đổi dòng tiến độ');

// Khóa học của học viên A: 1/10; học viên B không bị ảnh hưởng.
let courseA = await (await get('progress/son-tra-so', 'a', 'a@test')).json();
assert.equal(courseA.course, 'son-tra-so');
assert.deepEqual(summary(courseA), { completed_lessons: 1, percent: 10 });
assert.equal(courseA.lessons[3].completed, true);
assert.equal(courseA.lessons[3].completed_at, firstBody.completed_at);
assert.equal(courseA.lessons[0].completed_at, null, 'bài chưa hoàn thành không có completed_at');
const courseB = await (await get('progress/son-tra-so', 'b', 'b@test')).json();
assert.deepEqual(summary(courseB), { completed_lessons: 0, percent: 0 }, 'tiến độ không rò sang học viên khác');

// Đường sync cũ (POST /api/progress): đánh dấu done qua sync cũng ghi completed_at; không ghi đè khi đã có.
assert.equal((await post('progress', 'a', 'a@test', { code: codeA, read: [], done: [5], scores: {} })).status, 200);
const syncedAt = sql.prepare("SELECT completed_at FROM progress WHERE learner='a' AND lesson=5").get().completed_at;
assert.ok(isoUtc(syncedAt), 'sync đánh dấu done phải ghi completed_at');
await new Promise((resolve) => setTimeout(resolve, 5));
assert.equal((await post('progress', 'a', 'a@test', { code: codeA, read: [], done: [3, 5], scores: {} })).status, 200);
assert.equal(sql.prepare("SELECT completed_at FROM progress WHERE learner='a' AND lesson=5").get().completed_at, syncedAt, 'sync lặp không đổi completed_at');
assert.equal(sql.prepare("SELECT completed_at FROM progress WHERE learner='a' AND lesson=3").get().completed_at, firstBody.completed_at);

// Không đảo ngược: sync với danh sách rỗng không bỏ done (quy tắc 4.1: giá trị lớn nhất).
assert.equal((await post('progress', 'a', 'a@test', { code: codeA, read: [], done: [], scores: {} })).status, 200);
assert.equal(sql.prepare("SELECT done FROM progress WHERE learner='a' AND lesson=3").get().done, 1);

// Dòng cũ đã done nhưng completed_at NULL: sync không suy đoán thời điểm (không ghi giá trị giả).
sql.prepare("INSERT INTO progress(learner,lesson,read,done,score,updated,completed_at) VALUES('a',7,0,1,0,'2026-10-02T00:00:00.000Z',NULL)").run();
assert.equal((await post('progress', 'a', 'a@test', { code: codeA, read: [], done: [7], scores: {} })).status, 200);
assert.equal(sql.prepare("SELECT completed_at FROM progress WHERE learner='a' AND lesson=7").get().completed_at, null, 'không bịa completed_at cho dòng cũ');

// Dòng đã đọc (done = 0) rồi mới hoàn thành: đường UPSERT phải ghi completed_at đúng lúc done chuyển 0 -> 1.
// Chỉ đọc không được tính là hoàn thành (quy tắc 4.7).
assert.equal((await post('progress', 'a', 'a@test', { code: codeA, read: [8], done: [], scores: {} })).status, 200);
assert.equal(sql.prepare("SELECT completed_at FROM progress WHERE learner='a' AND lesson=8").get().completed_at, null, 'chỉ đọc không ghi completed_at');
assert.equal((await post('progress', 'a', 'a@test', { code: codeA, read: [8], done: [8], scores: {} })).status, 200);
assert.ok(isoUtc(sql.prepare("SELECT completed_at FROM progress WHERE learner='a' AND lesson=8").get().completed_at), 'sync chuyển 0 -> 1 phải ghi completed_at');
assert.equal((await post('progress', 'a', 'a@test', { code: codeA, read: [9], done: [], scores: {} })).status, 200);
const completedNine = await (await post('progress/complete', 'a', 'a@test', { code: codeA, lesson: 9 })).json();
assert.ok(isoUtc(completedNine.completed_at), 'complete trên dòng đã đọc phải ghi completed_at');
assert.equal(completedNine.completed_at, sql.prepare("SELECT completed_at FROM progress WHERE learner='a' AND lesson=9").get().completed_at);

// Hoàn thành toàn bộ 10 bài: 100%.
for (let lesson = 0; lesson <= 9; lesson++) {
  assert.equal((await post('progress/complete', 'a', 'a@test', { code: codeA, lesson })).status, 200);
}
courseA = await (await get('progress/son-tra-so', 'a', 'a@test')).json();
assert.deepEqual(summary(courseA), { completed_lessons: 10, percent: 100 });
assert.equal(courseA.lessons.every((lesson) => lesson.completed), true);
assert.equal(courseA.lessons[7].completed_at, null, 'bài cũ vẫn tính đã hoàn thành dù completed_at NULL');

// 4) Migration 0003 trên dữ liệu cũ: thêm cột, giữ nguyên dòng, dòng cũ vẫn được tính.
{
  const old = new DatabaseSync(':memory:');
  old.exec('PRAGMA foreign_keys = ON');
  applyMigrations(old, { from: 0, to: 3 });
  old.prepare("INSERT INTO learners(id,code,created) VALUES('x','ST-OLD','2026-10-01T00:00:00.000Z')").run();
  old.prepare("INSERT INTO progress(learner,lesson,read,done,score,updated) VALUES('x',2,1,1,0,'2026-10-02T00:00:00.000Z')").run();
  const applied = applyMigrations(old, { from: 3, to: 4 });
  assert.deepEqual(applied, ['0003_mo_rong_completed_at']);
  const row = { ...old.prepare("SELECT done,updated,completed_at FROM progress WHERE learner='x' AND lesson=2").get() };
  assert.deepEqual(row, { done: 1, updated: '2026-10-02T00:00:00.000Z', completed_at: null }, 'dòng cũ giữ nguyên, completed_at NULL');
  // Đưa DB cũ lên đến migration hiện tại để API chạy đúng schema (0010 thêm cột hidden).
  applyMigrations(old, { from: 4 });
  const oldApi = await loadApi(old);
  const course = await (await oldApi.GET(request('progress/son-tra-so', 'x', 'x@test'))).json();
  assert.deepEqual(summary(course), { completed_lessons: 1, percent: 10 }, 'dữ liệu cũ vẫn được tính tiến độ');
}

// Migration 0003 trên DB rỗng (đầy đủ 0000–0003) cũng có cột mới.
{
  const fresh = new DatabaseSync(':memory:');
  applyMigrations(fresh);
  const columns = fresh.prepare('PRAGMA table_info(progress)').all().map((c) => c.name);
  assert.ok(columns.includes('completed_at'), 'bảng progress phải có completed_at');
}

console.log('PASS: tiến độ khóa học: đầu vào, phân quyền, idempotency, khớp mã học viên, cô lập học viên, đường sync không đảo ngược và không suy đoán completed_at, tính phần trăm, migration 0003 trên dữ liệu cũ và rỗng');
