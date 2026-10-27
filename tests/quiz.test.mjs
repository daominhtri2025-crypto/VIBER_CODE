import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi } from './route-harness.mjs';

// Kiểm thử Mục 2 (bài kiểm tra trắc nghiệm): máy chủ chấm, ẩn đáp án, idempotency theo client_id,
// lịch sử lượt làm, cô lập học viên, đóng đường nhận điểm từ client, dashboard, migration 0004.
// Chạy trên SQLite thật (CLAUDE.md mục 7). Đáp án chỉ được đọc trực tiếp từ DB trong kiểm thử.

const ORIGIN = 'https://site.test';

function request(path, { id, email, body, origin = ORIGIN } = {}) {
  const headers = {};
  if (id) {
    headers['oai-authenticated-user-id'] = id;
    headers['oai-authenticated-user-email'] = email;
  }
  if (body !== undefined) {
    headers.origin = origin;
    headers['Content-Type'] = 'application/json';
  }
  return new Request(`${ORIGIN}/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
applyMigrations(sql);
const api = await loadApi(sql);

const get = (path, who = {}) => api.GET(request(path, who));
const post = (path, who, body, origin) => api.POST(request(path, { ...who, body, origin }));
const A = { id: 'quiz-a', email: 'a@test.test' };
const B = { id: 'quiz-b', email: 'b@test.test' };
const C = { id: 'quiz-c', email: 'c@test.test' };

const quizOf = (lesson) => JSON.parse(sql.prepare('SELECT quiz FROM lessons WHERE lesson=?').get(lesson).quiz);
const wrongChoiceOf = (lesson) => {
  const quiz = quizOf(lesson);
  return (quiz.answer + 1) % quiz.options.length;
};
const scoreOf = (learnerId, lesson) => {
  const row = sql.prepare('SELECT score FROM progress WHERE learner=? AND lesson=?').get(learnerId, lesson);
  return row ? row.score : null;
};
const attemptsOf = (learnerId) => sql.prepare('SELECT lesson, choice, correct, client_id FROM quiz_attempts WHERE learner=? ORDER BY created, client_id').all(learnerId);

const a = await (await get('me', A)).json();
const b = await (await get('me', B)).json();
const c = await (await get('me', C)).json();

// 1) Đáp án không có trong GET /api/lessons (quyết định 2).
{
  const body = await (await get('lessons')).json();
  assert.equal(body.lessons.length, 10);
  for (const lesson of body.lessons) assert.equal('answer' in lesson.quiz, false, `bài ${lesson.lesson} lộ đáp án`);
  assert.equal(JSON.stringify(body).includes('"answer"'), false, 'không được có khóa answer ở bất kỳ đâu trong phản hồi');
}

// 2) Phân quyền và Origin trước khi chấm (CLAUDE.md mục 2).
{
  const payload = { code: a.code, lesson: 0, choice: 0, client_id: 'quiz-auth-0001' };
  assert.equal((await post('quiz/answer', {}, payload)).status, 401, 'chưa đăng nhập không được chấm');
  assert.equal((await post('quiz/answer', A, payload, 'https://evil.test')).status, 403, 'Origin lạ bị chặn');
  assert.equal(attemptsOf(A.id).length, 0, 'yêu cầu bị chặn không được ghi lượt làm');
}

// 3) Kiểm tra đầu vào: 400 trước khi đọc bài; 409 khi mã học viên không khớp.
{
  const valid = { code: a.code, lesson: 0, choice: 0, client_id: 'quiz-input-0001' };
  const cases = [
    [{ ...valid, lesson: 10 }, 'lesson 10'],
    [{ ...valid, lesson: -1 }, 'lesson âm'],
    [{ ...valid, lesson: 1.5 }, 'lesson thực'],
    [{ ...valid, choice: -1 }, 'choice âm'],
    [{ ...valid, choice: '1' }, 'choice kiểu chuỗi'],
    [{ ...valid, client_id: 'abc' }, 'client_id quá ngắn'],
    [{ ...valid, client_id: undefined }, 'thiếu client_id'],
    [{ ...valid, choice: quizOf(0).options.length }, 'choice ngoài danh sách đáp án'],
  ];
  for (const [payload, label] of cases) {
    assert.equal((await post('quiz/answer', A, payload)).status, 400, `${label} phải trả 400`);
  }
  assert.equal((await post('quiz/answer', A, { ...valid, code: 'KHONG-KHOP' })).status, 409, 'mã học viên sai trả 409');
  assert.equal(attemptsOf(A.id).length, 0, 'đầu vào sai không được ghi lượt làm');
}

// 4) Chấm đúng: máy chủ đọc đáp án từ DB; phản hồi không tiết lộ đáp án (quyết định 2).
const rightA = quizOf(0).answer;
{
  const res = await post('quiz/answer', A, { code: a.code, lesson: 0, choice: rightA, client_id: 'quiz-a-0001' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, correct: true, attempt_count: 1 });
  assert.equal(scoreOf(A.id, 0), 1, 'đáp án đúng ghi điểm kiểm tra');
}

// 5) Chấm sai: không hạ điểm đã có (quy tắc 4.1); phản hồi không tiết lộ đáp án đúng.
{
  const res = await post('quiz/answer', A, { code: a.code, lesson: 0, choice: wrongChoiceOf(0), client_id: 'quiz-a-0002' });
  const body = await res.json();
  assert.deepEqual(body, { ok: true, correct: false, attempt_count: 2 });
  assert.deepEqual(Object.keys(body).sort(), ['attempt_count', 'correct', 'ok'], 'phản hồi không có trường nào khác (không lộ đáp án)');
  assert.equal(scoreOf(A.id, 0), 1, 'làm sai không được hạ điểm đã đạt');
}

// 6) Idempotency theo (learner, client_id) (quyết định 5).
{
  const replay = await post('quiz/answer', A, { code: a.code, lesson: 0, choice: rightA, client_id: 'quiz-a-0001' });
  assert.deepEqual(await replay.json(), { ok: true, correct: true, attempt_count: 2 }, 'gửi lại không tạo lượt mới');
  assert.equal(attemptsOf(A.id).length, 2, 'gửi lại không được tăng số lượt');

  const conflict = await post('quiz/answer', A, { code: a.code, lesson: 0, choice: wrongChoiceOf(0), client_id: 'quiz-a-0001' });
  assert.equal(conflict.status, 409, 'cùng client_id khác lựa chọn phải trả 409');
  const otherLesson = await post('quiz/answer', A, { code: a.code, lesson: 1, choice: 0, client_id: 'quiz-a-0001' });
  assert.equal(otherLesson.status, 409, 'cùng client_id khác bài phải trả 409');
  assert.equal(attemptsOf(A.id).length, 2, 'xung đột không được ghi đè lượt cũ');
}

// 7) Lịch sử lượt làm được ghi đầy đủ, correct do máy chủ tính (quyết định 4).
{
  const rows = attemptsOf(A.id);
  assert.deepEqual(rows.map((r) => [r.lesson, r.choice, r.correct]), [[0, rightA, 1], [0, wrongChoiceOf(0), 0]]);
}

// 8) Phục hồi sau sự cố: lượt đúng đã ghi nhưng điểm chưa ghi thì gửi lại phải hoàn tất điểm.
{
  sql.prepare('DELETE FROM progress WHERE learner=? AND lesson=0').run(A.id);
  assert.equal(scoreOf(A.id, 0), null);
  const res = await post('quiz/answer', A, { code: a.code, lesson: 0, choice: rightA, client_id: 'quiz-a-0001' });
  assert.equal(res.status, 200);
  assert.equal(scoreOf(A.id, 0), 1, 'thử lại lượt đúng phải khôi phục điểm');
}

// 9) Cô lập học viên: cùng client_id ở học viên khác là lượt khác; không thấy lịch sử của người khác.
{
  const res = await post('quiz/answer', B, { code: b.code, lesson: 0, choice: wrongChoiceOf(0), client_id: 'quiz-a-0001' });
  assert.equal(res.status, 200, 'client_id trùng ở học viên khác không bị coi là xung đột');
  assert.deepEqual(await res.json(), { ok: true, correct: false, attempt_count: 1 });
  assert.equal(scoreOf(B.id, 0), null, 'làm sai không tạo điểm cho học viên B');
  assert.equal(attemptsOf(A.id).length, 2, 'lượt của B không được đếm vào A');
}

// 10) Đường đồng bộ tiến độ không nhận điểm từ client (quyết định 3).
{
  const res = await post('progress', B, { code: b.code, read: [2], done: [], scores: { 2: 1, 5: 1 } });
  assert.equal(res.status, 200, 'client cũ vẫn gửi scores thì không bị lỗi');
  assert.equal(scoreOf(B.id, 2), 0, 'scores từ client không được ghi thành điểm');
  assert.equal(scoreOf(B.id, 5), null, 'scores cho bài chưa làm không tạo dòng điểm');
  assert.equal(scoreOf(A.id, 0), 1, 'đồng bộ của B không chạm vào điểm của A');
}

// 11) Dữ liệu bài hỏng: không chấm sai, trả 503 (không đoán đáp án).
{
  const original = sql.prepare('SELECT quiz FROM lessons WHERE lesson=9').get().quiz;
  sql.prepare("UPDATE lessons SET quiz='{}' WHERE lesson=9").run();
  const res = await post('quiz/answer', C, { code: c.code, lesson: 9, choice: 0, client_id: 'quiz-c-0009' });
  assert.equal(res.status, 503, 'quiz hỏng phải trả 503');
  assert.equal(attemptsOf(C.id).length, 0, 'quiz hỏng không được ghi lượt làm');
  sql.prepare('UPDATE lessons SET quiz=? WHERE lesson=9').run(original);
}

// 12) Dashboard: số lượt và tỷ lệ đúng (quyết định 4). Học viên chưa làm bài có tỷ lệ null, không phải 0.
{
  const dash = await (await get('dashboard', { id: 'owner', email: 'owner@example.test' })).json();
  const rowA = dash.learners.find((l) => l.code === a.code);
  const rowB = dash.learners.find((l) => l.code === b.code);
  const rowC = dash.learners.find((l) => l.code === c.code);
  // A có đúng 2 lượt (1 đúng, 1 sai); gửi lại cùng client_id không được đếm thành lượt mới.
  assert.equal(rowA.quiz_attempts, 2);
  assert.equal(rowA.quiz_correct, 1);
  assert.equal(rowA.quiz_rate, 50);
  assert.equal(rowB.quiz_attempts, 1);
  assert.equal(rowB.quiz_rate, 0);
  assert.equal(rowC.quiz_attempts, 0);
  assert.equal(rowC.quiz_rate, null, 'chưa làm bài thì tỷ lệ là null');
  assert.equal((await get('dashboard', B)).status, 403, 'học viên không xem được dashboard');
}

// 13) Migration 0004 trên DB rỗng: bảng, unique index và CHECK đều có hiệu lực.
{
  const fresh = new DatabaseSync(':memory:');
  fresh.exec('PRAGMA foreign_keys = ON');
  const tags = applyMigrations(fresh);
  assert.ok(tags.includes('0004_quiz_attempts'), 'journal phải có 0004');
  fresh.prepare("INSERT INTO learners (id, code, created) VALUES ('x','ST-X','2026-01-01T00:00:00Z')").run();
  const insert = (id, lesson, choice, correct, clientId) => fresh.prepare(
    'INSERT INTO quiz_attempts (id, learner, lesson, choice, correct, client_id, created) VALUES (?,?,?,?,?,?,?)',
  ).run(id, 'x', lesson, choice, correct, clientId, '2026-01-01T00:00:00Z');
  insert('q1', 0, 0, 1, 'fresh-0001');
  assert.throws(() => insert('q2', 0, 0, 1, 'fresh-0001'), /UNIQUE/, 'trùng (learner, client_id) phải bị từ chối');
  assert.throws(() => insert('q3', 10, 0, 1, 'fresh-0002'), /CHECK/, 'lesson 10 phải bị từ chối');
  assert.throws(() => insert('q4', 1, 0, 2, 'fresh-0003'), /CHECK/, 'correct 2 phải bị từ chối');
  assert.throws(() => insert('q5', 1, -1, 0, 'fresh-0004'), /CHECK/, 'choice âm phải bị từ chối');
  assert.equal(fresh.prepare('PRAGMA foreign_key_check').all().length, 0);
}

// 14) Migration 0004 trên DB có dữ liệu cũ (đến 0003): tiến độ cũ giữ nguyên, bảng mới rỗng.
{
  const old = new DatabaseSync(':memory:');
  old.exec('PRAGMA foreign_keys = ON');
  applyMigrations(old, { to: 4 });
  old.prepare("INSERT INTO learners (id, code, created) VALUES ('l1','ST-OLD','2026-01-01T00:00:00Z')").run();
  old.prepare("INSERT INTO progress (learner, lesson, read, done, score, updated, completed_at) VALUES ('l1',3,1,1,0,'2026-01-02T00:00:00Z','2026-01-02T00:00:00Z')").run();
  applyMigrations(old, { from: 4 });
  const row = old.prepare('SELECT learner, lesson, read, done, score, updated, completed_at FROM progress WHERE learner=?').get('l1');
  assert.deepEqual({ ...row }, { learner: 'l1', lesson: 3, read: 1, done: 1, score: 0, updated: '2026-01-02T00:00:00Z', completed_at: '2026-01-02T00:00:00Z' }, 'tiến độ cũ không đổi');
  assert.equal(old.prepare('SELECT COUNT(*) AS n FROM quiz_attempts').get().n, 0);
  assert.equal(old.prepare('PRAGMA foreign_key_check').all().length, 0);
}

console.log('PASS: quiz: ẩn đáp án, chấm trên máy chủ, 400/401/403/409, idempotency theo client_id, lịch sử, phục hồi sau sự cố, cô lập học viên, đóng đường điểm từ client, dữ liệu bài hỏng, dashboard nội bộ, migration 0004 trên DB rỗng và có dữ liệu');
