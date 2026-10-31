import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi, loadShared } from './route-harness.mjs';
import { ownerCookie, volunteerCookie, ORIGIN } from './auth-helper.mjs';

// Kiểm thử quản lý bài học (quyết định 30/10/2026; CLAUDE.md mục 4.4, 4.15, 4.16, 5, 7).
// Dùng SQLite thật và route.ts thật. Mỗi nhóm đánh dấu quy tắc đang kiểm.

const rules = await loadShared('lesson-admin-rules');

// 1) Kiểm tra đầu vào: mã bài là số nguyên không âm trong trần; nhóm 1–5; đáp án nằm trong danh sách.
{
  const base = {
    lesson: 10, title: 'Bài mới', group_no: 2, icon: '📘', summary: 'Mô tả ngắn',
    steps: ['Bước 1'], quiz: { question: 'Chọn đáp án đúng?', options: ['Sai', 'Đúng'], answer: 1 }, next_step: 'Tiếp theo',
  };
  assert.equal(rules.validateLessonInput(base).ok, true, 'bài mã 10 hợp lệ (không còn cố định 0–9)');
  assert.equal(rules.validateLessonInput({ ...base, lesson: 1000 }).ok, false, 'mã vượt trần bị từ chối');
  assert.equal(rules.validateLessonInput({ ...base, lesson: -1 }).ok, false, 'mã âm bị từ chối');
  assert.equal(rules.validateLessonInput({ ...base, lesson: '3' }).ok, false, 'mã dạng chuỗi bị từ chối');
  assert.equal(rules.validateLessonInput({ ...base, group_no: 6 }).ok, false, 'nhóm 6 bị từ chối');
  assert.equal(rules.validateLessonInput({ ...base, quiz: { ...base.quiz, answer: 2 } }).ok, false, 'đáp án ngoài danh sách bị từ chối');
  assert.equal(rules.validateLessonInput({ ...base, title: '   ' }).ok, false, 'tiêu đề toàn khoảng trắng bị từ chối');
  assert.equal(rules.validateLessonInput({ ...base, steps: Array(11).fill('x') }).ok, false, 'quá 10 bước bị từ chối');
  assert.equal(rules.validateLessonInput(null).ok, false);
  assert.equal(rules.validateVisibility({ lesson: 3, hidden: 'yes' }).ok, false, 'cờ ẩn phải là boolean');
  assert.equal(rules.validatePage('0').ok, false, 'trang 0 bị từ chối');
  assert.equal(rules.validatePage('abc').ok, false);
  assert.equal(rules.validatePage(null).value, 1, 'thiếu tham số thì lấy trang 1');
  assert.equal(rules.validateLessonQuery('-2').ok, false);
  const write = rules.toLessonWrite(rules.validateLessonInput(base).value);
  assert.equal(JSON.parse(write.body).icon, '📘');
  assert.equal(JSON.parse(write.quiz).answer, 1, 'đáp án được lưu trong JSON, không trả ra ngoài API công khai');
}

// 2) Migration 0010 trên DB rỗng: bảng mới có cột hidden và updated; lịch sử có khóa ngoại tới lessons.
{
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sql);
  const cols = sql.prepare('PRAGMA table_info(lessons)').all().map((c) => c.name);
  assert.ok(cols.includes('hidden') && cols.includes('updated'), 'lessons có cột hidden và updated');
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM lessons WHERE hidden = 0 AND updated = created").get().n, 10, 'bài seed: hidden = 0, updated = created');
  assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length, 0);
}

// 3) Migration 0010 trên DB có dữ liệu: giữ nguyên bài đã sửa, tiến độ, lượt làm; không ghi đè bài khi migrate (quy tắc 4.16).
{
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sql, { to: 3 });
  sql.prepare("UPDATE lessons SET title = 'Tiêu đề đã sửa trước 0010' WHERE lesson = 3").run();
  applyMigrations(sql, { from: 3, to: 5 });
  sql.prepare("INSERT INTO learners (id, code, created) VALUES ('l1','ST-MIG','2026-01-01T00:00:00Z')").run();
  sql.prepare("INSERT INTO progress (learner, lesson, read, done, score, updated) VALUES ('l1',2,1,1,0,'2026-01-02T00:00:00Z')").run();
  sql.prepare("INSERT INTO quiz_attempts (id, learner, lesson, choice, correct, client_id, created) VALUES ('q1','l1',3,1,1,'client-mig-001','2026-01-03T00:00:00Z')").run();
  const before = {
    progress: sql.prepare('SELECT * FROM progress ORDER BY learner, lesson').all().map((r) => ({ ...r })),
    attempts: sql.prepare('SELECT * FROM quiz_attempts ORDER BY id').all().map((r) => ({ ...r })),
  };
  applyMigrations(sql, { from: 5 });
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM lessons').get().n, 10, 'số bài không đổi khi nâng cấp');
  assert.equal(sql.prepare('SELECT title FROM lessons WHERE lesson = 3').get().title, 'Tiêu đề đã sửa trước 0010', 'bài đã sửa không bị seed ghi đè');
  assert.deepEqual(sql.prepare('SELECT * FROM progress ORDER BY learner, lesson').all().map((r) => ({ ...r })), before.progress, 'tiến độ giữ nguyên');
  assert.deepEqual(sql.prepare('SELECT * FROM quiz_attempts ORDER BY id').all().map((r) => ({ ...r })), before.attempts, 'lượt làm giữ nguyên');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM lessons WHERE hidden = 1').get().n, 0);
  assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length, 0);
}

// 4) Ràng buộc CSDL mới: mã 10 được nhận; mã âm, nhóm ngoài 1–5 và hidden ngoài {0,1} bị từ chối.
{
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sql);
  const insert = (lesson, group, hidden = 0) => sql.prepare(
    "INSERT INTO lessons (lesson, title, group_no, body, quiz, created, updated, hidden) VALUES (?, 'T', ?, '{}', '{}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', ?)",
  ).run(lesson, group, hidden);
  const rejects = (fn) => { try { fn(); return false; } catch { return true; } };
  assert.equal(rejects(() => insert(10, 1)), false, 'mã 10 được nhận');
  assert.equal(rejects(() => insert(-1, 1)), true, 'mã âm bị từ chối');
  assert.equal(rejects(() => insert(11, 6)), true, 'nhóm 6 bị từ chối');
  assert.equal(rejects(() => insert(12, 1, 2)), true, 'hidden = 2 bị từ chối');
  // quiz_attempts (migration 0011): lượt làm trên mã 10 được ghi; mã âm và correct ngoài {0,1} bị từ chối.
  const attempt = (lesson, correct = 1) => sql.prepare("INSERT INTO quiz_attempts (id, learner, lesson, choice, correct, client_id, created) VALUES (?, 'l9', ?, 0, ?, ?, '2026-01-01T00:00:00Z')").run(`a-${lesson}-${correct}-${Math.random()}`, lesson, correct, `cid-${lesson}-${correct}-${Math.random()}`);
  sql.prepare("INSERT INTO learners (id, code, created) VALUES ('l9', 'ST-CK', '2026-01-01T00:00:00Z')").run();
  assert.equal(rejects(() => attempt(10)), false, 'lượt làm trên mã 10 được ghi');
  assert.equal(rejects(() => attempt(-1)), true, 'lượt làm trên mã âm bị từ chối');
  assert.equal(rejects(() => attempt(10, 2)), true, 'correct = 2 bị từ chối');
}

// 5) API: phân quyền, Origin, tạo, sửa có lịch sử, ẩn, phân trang, và ảnh hưởng tới học viên và báo cáo.
{
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sql);
  const api = await loadApi(sql);
  const owner = await ownerCookie(api);
  const volunteer = await volunteerCookie(api, 'tinh-nguyen-bai-hoc@example.test');

  const get = (path, cookie, identity) => api.GET(new Request(`${ORIGIN}${path}`, {
    headers: { ...(cookie ? { cookie } : {}), ...(identity ? { 'oai-authenticated-user-id': identity } : {}) },
  }));
  const post = (path, body, cookie, origin = ORIGIN) => api.POST(new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));
  const asLearner = (path, body) => api.POST(new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'hv-ql-1' },
    body: JSON.stringify(body),
  }));
  const lessonBody = (overrides = {}) => ({
    lesson: 10, title: 'Bài mới', group_no: 2, icon: '📘', summary: 'Mô tả ngắn', steps: ['Bước 1', 'Bước 2'],
    quiz: { question: 'Chọn đáp án đúng?', options: ['Sai', 'Đúng'], answer: 1 }, next_step: 'Bài tiếp theo', ...overrides,
  });

  // 5a) Phân quyền: ẩn danh 401, tình nguyện viên 403, Origin lạ 403 (quy tắc mục 2, 2C).
  assert.equal((await get('/api/admin/lessons')).status, 401, 'khách không xem được danh sách quản trị');
  assert.equal((await get('/api/admin/lessons', volunteer)).status, 403, 'tình nguyện viên không quản lý bài');
  assert.equal((await post('/api/admin/lessons', lessonBody(), owner, 'https://evil.test')).status, 403, 'Origin lạ bị từ chối');
  assert.equal((await post('/api/admin/lessons', lessonBody(), volunteer)).status, 403, 'tình nguyện viên không tạo được bài');
  assert.equal((await post('/api/admin/lessons', lessonBody({ lesson: 1000 }), owner)).status, 400, 'mã vượt trần bị 400');

  // 5b) Tạo 12 bài mới (mã 10–21): tổng 22, phân trang 10 bài mỗi trang.
  for (let lesson = 10; lesson <= 21; lesson++) {
    const res = await post('/api/admin/lessons', lessonBody({ lesson, title: `Bài ${lesson}` }), owner);
    assert.equal(res.status, 201, `tạo bài ${lesson}`);
  }
  assert.equal((await post('/api/admin/lessons', lessonBody({ lesson: 10 }), owner)).status, 409, 'mã trùng bị 409, không ghi đè');
  const page1 = await (await get('/api/admin/lessons?page=1', owner)).json();
  const page3 = await (await get('/api/admin/lessons?page=3', owner)).json();
  assert.equal(page1.total, 22);
  assert.equal(page1.pages, 3);
  assert.equal(page1.lessons.length, 10, 'trang 1 có 10 bài');
  assert.equal(page3.lessons.length, 2, 'trang 3 có 2 bài');
  assert.equal((await get('/api/admin/lessons?page=0', owner)).status, 400, 'số trang 0 bị 400');

  // 5c) Sửa bài: bản cũ vào lịch sử; sửa lần hai thêm một bản; bài không tồn tại trả 404.
  assert.equal((await post('/api/admin/lessons/update', lessonBody({ title: 'Bài đã sửa lần 1' }), owner)).status, 200);
  assert.equal((await post('/api/admin/lessons/update', lessonBody({ title: 'Bài đã sửa lần 2' }), owner)).status, 200);
  assert.equal((await post('/api/admin/lessons/update', lessonBody({ lesson: 999 }), owner)).status, 404, 'sửa bài không tồn tại trả 404');
  assert.equal((await post('/api/admin/lessons/update', lessonBody(), volunteer)).status, 403, 'tình nguyện viên không sửa được bài');
  const versions = await (await get('/api/admin/lessons/versions?lesson=10', owner)).json();
  assert.equal(versions.versions.length, 2, 'mỗi lần sửa thêm một bản lịch sử');
  assert.equal(versions.versions[0].title, 'Bài đã sửa lần 1', 'bản mới nhất trước: là trạng thái trước lần sửa thứ hai');
  assert.equal(versions.versions[1].title, 'Bài 10', 'bản gốc (tạo trong vòng lặp) được giữ nguyên trong lịch sử');
  assert.equal(versions.versions[1].quiz.answer, 1, 'lịch sử giữ đáp án để đối chiếu (chỉ quản trị viên đọc được)');
  const publicCatalog = await (await get('/api/lessons')).json();
  assert.equal(publicCatalog.lessons.length, 22);
  assert.equal(publicCatalog.lessons.find((l) => l.lesson === 10).title, 'Bài đã sửa lần 2');
  assert.equal(publicCatalog.lessons.find((l) => l.lesson === 10).quiz.answer, undefined, 'học viên không nhận đáp án');

  // 5d) Học viên làm bài và hoàn thành bài 10 khi còn hiển thị.
  const learner = await (await get('/api/me', null, 'hv-ql-1')).json();
  const code = learner.code;
  // Học viên được nhận diện bằng header danh tính (quy tắc mục 2C: học viên không dùng cookie quản trị).
  assert.equal((await asLearner('/api/quiz/answer', { code, lesson: 10, choice: 1, client_id: 'quiz-hv-ql-010' })).status, 200, 'học viên làm bài trên bài 10 khi đang hiển thị');

  // 5e) Ẩn bài 10: không ghi lịch sử khi trạng thái không đổi; học viên không nhận lượt mới (quy tắc 4.15).
  const hideRes = await (await post('/api/admin/lessons/visibility', { lesson: 10, hidden: true }, owner)).json();
  assert.equal(hideRes.changed, true);
  assert.equal((await post('/api/admin/lessons/visibility', { lesson: 10, hidden: true }, owner)).status, 200);
  const hiddenAgain = await (await post('/api/admin/lessons/visibility', { lesson: 10, hidden: true }, owner)).json();
  assert.equal(hiddenAgain.changed, false, 'ẩn lại bài đã ẩn không đổi gì');
  assert.equal((await get('/api/admin/lessons/versions?lesson=10', owner).then((r) => r.json())).versions.length, 3, 'chỉ thêm một bản khi trạng thái đổi');
  const afterHide = await (await get('/api/lessons')).json();
  assert.equal(afterHide.lessons.length, 21, 'học viên không còn thấy bài 10');
  assert.equal((await get('/api/admin/lessons?page=2', owner).then((r) => r.json())).lessons.find((l) => l.lesson === 10).hidden, true, 'quản trị vẫn thấy bài đã ẩn kèm cờ');
  assert.equal((await asLearner('/api/quiz/answer', { code, lesson: 10, choice: 0, client_id: 'quiz-hv-ql-002' })).status, 409, 'bài đã ẩn không nhận lượt làm mới');
  assert.equal((await asLearner('/api/progress/complete', { code, lesson: 10 })).status, 409, 'bài đã ẩn không nhận hoàn thành mới');

  // 5f) Tiến độ và báo cáo: mẫu số là số bài đang hiển thị; bài ẩn vẫn có trong thống kê theo bài và được đánh dấu.
  const course = await (await api.GET(new Request(`${ORIGIN}/api/progress/son-tra-so`, { headers: { 'oai-authenticated-user-id': 'hv-ql-1' } }))).json();
  assert.equal(course.total, 21, 'tiến độ chỉ tính bài đang hiển thị');
  const report = await (await get('/api/dashboard', owner)).json();
  assert.equal(report.report.lessons.length, 22, 'thống kê theo bài giữ bài đã ẩn');
  assert.equal(report.report.lessons.find((l) => l.lesson === 10).hidden, true, 'bài ẩn được đánh dấu');
  const learnerRow = report.report.learners.find((l) => l.code === code);
  assert.equal(learnerRow.attempted, 0, 'lượt làm trên bài đã ẩn không vào ngưỡng đạt');

  // 5g) Mở lại bài 10: lịch sử vẫn đủ, bài quay về danh mục công khai.
  assert.equal((await post('/api/admin/lessons/visibility', { lesson: 10, hidden: false }, owner)).status, 200);
  assert.equal((await get('/api/lessons').then((r) => r.json())).lessons.length, 22);

  // 5h) Hàng hỏng trong danh mục công khai vẫn báo 503 (không trả danh mục dở dang).
  sql.prepare("UPDATE lessons SET body = 'hỏng' WHERE lesson = 11").run();
  assert.equal((await get('/api/lessons')).status, 503, 'hàng hỏng báo 503');
  sql.prepare("UPDATE lessons SET hidden = 1").run();
  sql.prepare("UPDATE lessons SET body = (SELECT body FROM lessons WHERE lesson = 0) WHERE lesson = 11").run();
  const allHidden = await get('/api/lessons');
  assert.equal(allHidden.status, 200, 'mọi bài đều ẩn là trạng thái hợp lệ');
  assert.deepEqual((await allHidden.json()).lessons, [], 'danh mục rỗng, không báo lỗi');
}

console.log('PASS: quản lý bài học: kiểm tra đầu vào, migration 0010 giữ dữ liệu, ràng buộc CSDL, API quản trị, lịch sử, ẩn bài, tiến độ và báo cáo');
