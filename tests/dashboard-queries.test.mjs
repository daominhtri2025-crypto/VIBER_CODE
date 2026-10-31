import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadShared, createD1Adapter } from './route-harness.mjs';

// Kiểm thử tích hợp cho shared/dashboard-queries (Bước 3), chạy trên SQLite thật qua adapter prepare/bind/all.
// Kết quả SQL được đối chiếu với các hàm JavaScript trên cùng dữ liệu gốc (dashboard-rules).
// Lưu ý: kiểm thử này chứng minh tính đúng đắn trên engine SQLite. Chạy thật trên D1 cần thực hiện riêng.
const queries = await loadShared('dashboard-queries');
const rules = await loadShared('dashboard-rules');

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
applyMigrations(sql);
const db = createD1Adapter(sql);

const ins = {
  learner: sql.prepare('INSERT INTO learners (id, code, created) VALUES (?, ?, ?)'),
  progress: sql.prepare('INSERT INTO progress (learner, lesson, read, done, score, updated, completed_at) VALUES (?, ?, 1, ?, 0, ?, ?)'),
  attempt: sql.prepare('INSERT INTO quiz_attempts (id, learner, lesson, choice, correct, client_id, created) VALUES (?, ?, ?, 0, ?, ?, ?)'),
  assessment: sql.prepare('INSERT INTO assessments (id, learner, phase, scores, assessor, created, client_id) VALUES (?, ?, ?, ?, ?, ?, ?)'),
};

// Dữ liệu nhỏ có chủ đích: mốc 17:00 UTC là 00:00 ngày kế tiếp ở Việt Nam.
ins.learner.run('l-a', 'ST-A', '2026-10-01T00:00:00.000Z');
ins.learner.run('l-b', 'ST-B', '2026-10-01T00:00:00.000Z');
ins.learner.run('l-c', 'ST-C', '2026-10-01T00:00:00.000Z');

let n = 0;
const attempt = (learner, lesson, correct, created) => ins.attempt.run(`q-${++n}`, learner, lesson, correct, `cid-${n}-xxxxxx`, created);
attempt('l-a', 0, 1, '2026-10-26T16:59:59.999Z');
attempt('l-a', 0, 0, '2026-10-26T17:00:00.000Z');
for (let lesson = 1; lesson <= 6; lesson++) attempt('l-a', lesson, 1, '2026-10-27T03:00:00.000Z');
attempt('l-a', 7, 0, '2026-10-20T03:00:00.000Z');
attempt('l-b', 0, 0, '2026-10-27T01:00:00.000Z');
attempt('l-b', 9, 1, '2026-10-27T01:00:00.000Z');

ins.progress.run('l-a', 0, 1, '2026-10-27T02:00:00.000Z', '2026-10-27T02:00:00.000Z');
ins.progress.run('l-a', 1, 1, '2026-10-27T03:00:00.000Z', null); // dòng cũ không có completed_at
ins.progress.run('l-b', 9, 1, '2026-10-26T18:00:00.000Z', '2026-10-26T18:00:00.000Z');

// Lấy dữ liệu thô trực tiếp từ DB để đối chiếu với hàm JavaScript.
const rawAttempts = sql.prepare('SELECT learner, lesson, correct, created FROM quiz_attempts').all()
  .map((r) => ({ learner: r.learner, lesson: r.lesson, correct: r.correct, created: r.created }));
const rawCompletions = sql.prepare('SELECT learner, lesson, completed_at FROM progress WHERE done = 1').all()
  .map((r) => ({ learner: r.learner, lesson: r.lesson, completed_at: r.completed_at }));
const codeOf = new Map(sql.prepare('SELECT id, code FROM learners').all().map((r) => [r.id, r.code]));
const attemptsWithCode = rawAttempts.map((r) => ({ ...r, learner: codeOf.get(r.learner) }));
const completionsWithCode = rawCompletions.map((r) => ({ ...r, learner: codeOf.get(r.learner) }));

// 1) Chuỗi thời gian SQL khớp với periodSeries JavaScript trên cùng dữ liệu, cả theo ngày lẫn theo tuần.
{
  for (const granularity of ['day', 'week']) {
    const snap = await queries.loadDashboardSnapshot(db, { granularity });
    const expected = rules.periodSeries(attemptsWithCode, completionsWithCode, granularity);
    assert.deepEqual(snap.series, expected, `chuỗi ${granularity} phải khớp hàm JavaScript`);
  }
  const day = await queries.loadDashboardSnapshot(db, { granularity: 'day' });
  // 16:59:59.999Z là 23:59:59 ngày 26/10 ở Việt Nam; 17:00Z là 00:00 ngày 27/10. Hoàn thành 18:00Z ngày 26/10 là 01:00 ngày 27/10.
  assert.deepEqual(day.series.find((p) => p.period === '2026-10-26'), { period: '2026-10-26', attempts: 1, correct: 1, completions: 0 }, 'mốc 16:59:59.999Z thuộc 26/10 ở Việt Nam');
  assert.deepEqual(day.series.find((p) => p.period === '2026-10-27'), { period: '2026-10-27', attempts: 9, correct: 7, completions: 2 }, 'mốc 17:00Z thuộc 27/10; hoàn thành 18:00Z 26/10 thuộc 27/10');
}

// 2) Theo học viên: SQL khớp learnerQuizResults; học viên chưa làm bài có trạng thái chưa có dữ liệu, rate null.
{
  const snap = await queries.loadDashboardSnapshot(db);
  const expected = rules.learnerQuizResults(attemptsWithCode, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const row of snap.learners) {
    if (expected.has(row.code)) {
      const e = expected.get(row.code);
      assert.equal(row.quiz.status, e.status, `trạng thái ${row.code}`);
      assert.equal(row.attempted, e.attemptedLessons, `số bài đã làm ${row.code}`);
      assert.equal(row.correctLessons, e.correctLessons, `số bài đúng ${row.code}`);
    }
  }
  const c = snap.learners.find((l) => l.code === 'ST-C');
  assert.deepEqual(c.quiz, { status: 'chua_co_du_lieu', rate: null, attemptedLessons: 0, correctLessons: 0 }, 'chưa làm bài không quy thành 0');
  assert.equal(snap.learners.find((l) => l.code === 'ST-A').quiz.status, 'dat', 'A có 7/10 bài đúng: đạt');
  assert.equal(snap.learners.find((l) => l.code === 'ST-B').quiz.status, 'chua_dat');
}

// 3) Theo bài: SQL khớp lessonStats; bài chưa có lượt làm có tỷ lệ null.
{
  const snap = await queries.loadDashboardSnapshot(db);
  // Bài đang hiển thị nên mọi bài có hidden = false (quy tắc 4.15).
  assert.deepEqual(snap.lessons, rules.lessonStats(attemptsWithCode, completionsWithCode, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).map((stat) => ({ ...stat, hidden: false })));
  assert.equal(snap.lessons[8].attemptCorrectRate, null);
}

// 4) Khoảng thời gian: hai đầu bao gồm, và chỉ mốc created/completed_at nằm trong khoảng được đếm.
{
  const boundary = await queries.loadDashboardSnapshot(db, { to: '2026-10-26T16:59:59.999Z' });
  assert.equal(boundary.lessons[0].attempts, 1, 'mốc đúng bằng đầu kia được tính');
  const inclusive = await queries.loadDashboardSnapshot(db, { to: '2026-10-26T17:00:00.000Z' });
  assert.equal(inclusive.lessons[0].attempts, 2);

  const day27 = await queries.loadDashboardSnapshot(db, { from: '2026-10-27T00:00:00.000Z', to: '2026-10-27T23:59:59.999Z' });
  assert.equal(day27.lessons.reduce((sum, l) => sum + l.attempts, 0), 8, '6 lượt đúng của A và 2 lượt của B trong ngày 27/10 UTC');
  assert.equal(day27.lessons.reduce((sum, l) => sum + l.completed, 0), 1, 'dòng completed_at NULL không được tính khi có khoảng thời gian');
}

// 5) Bộ lọc bài và nhóm: danh sách chỉ còn các bài được chọn.
{
  const lessonOnly = await queries.loadDashboardSnapshot(db, { lesson: 1 });
  assert.deepEqual(lessonOnly.lessons.map((l) => l.lesson), [1]);
  const lessonGroups = sql.prepare('SELECT lesson, group_no FROM lessons').all();
  const groupNo = lessonGroups.find((r) => r.lesson === 0).group_no;
  const byGroup = await queries.loadDashboardSnapshot(db, { group: groupNo });
  const expectedLessons = lessonGroups.filter((r) => r.group_no === groupNo).map((r) => r.lesson).sort((a, b) => a - b);
  assert.deepEqual(byGroup.lessons.map((l) => l.lesson), expectedLessons);
  assert.equal(byGroup.groups.length, 1);
  assert.equal(byGroup.groups[0].group, groupNo);
}

// 6) Đối chiếu trước–sau (FR-DSH-03): chỉ đưa vào nhóm khi cả hai lần đo đủ 5 nhiệm vụ; phiếu mới nhất thắng.
{
  ins.assessment.run('as-1', 'l-a', 'Trước học', '[0,0,0,0,0]', 'owner', '2026-10-02T00:00:00.000Z', 'pre-a-1');
  ins.assessment.run('as-2', 'l-a', 'Trước học', '[3,3,3,0,0]', 'owner', '2026-10-03T00:00:00.000Z', 'pre-a-2');
  ins.assessment.run('as-3', 'l-a', 'Sau học', '[3,3,3,3,0]', 'owner', '2026-10-05T00:00:00.000Z', 'post-a-1');
  ins.assessment.run('as-4', 'l-b', 'Trước học', '[3,3,3,3,3]', 'owner', '2026-10-02T00:00:00.000Z', 'pre-b-1');
  const snap = await queries.loadDashboardSnapshot(db);
  assert.deepEqual(snap.prePost, { pairs: 1, beforeAchieved: 1, afterAchieved: 1 }, 'chỉ A có đủ hai lần đo; B thiếu sau học');
}

// 7) Đầu vào sai bị từ chối bằng lỗi.
{
  assert.throws(() => queries.normalizeFilter({ from: '2026-13-45' }), RangeError);
  assert.throws(() => queries.normalizeFilter({ from: '2026-10-27T00:00:00Z', to: '2026-10-26T00:00:00Z' }), RangeError);
  assert.throws(() => queries.normalizeFilter({ lesson: 1000 }), RangeError);
  assert.throws(() => queries.normalizeFilter({ group: 6 }), RangeError);
  assert.throws(() => queries.normalizeFilter({ granularity: 'month' }), RangeError);
  assert.equal(queries.normalizeFilter({ from: '2026-10-27T00:00:00Z' }).from, '2026-10-27T00:00:00.000Z', 'chuẩn hóa về toISOString');
}

// 8) Quy mô mục tiêu NFR-PERF-03: 500 học viên, mỗi người làm 10 bài với 2 lượt; đo thời gian truy vấn tổng hợp.
{
  const big = new DatabaseSync(':memory:');
  big.exec('PRAGMA foreign_keys = ON');
  applyMigrations(big);
  const bigDb = createD1Adapter(big);
  big.exec('BEGIN');
  const learnerStmt = big.prepare('INSERT INTO learners (id, code, created) VALUES (?, ?, ?)');
  const attemptStmt = big.prepare('INSERT INTO quiz_attempts (id, learner, lesson, choice, correct, client_id, created) VALUES (?, ?, ?, 0, ?, ?, ?)');
  const progressStmt = big.prepare('INSERT INTO progress (learner, lesson, read, done, score, updated, completed_at) VALUES (?, ?, 1, 1, 0, ?, ?)');
  let k = 0;
  for (let i = 0; i < 500; i++) {
    const learner = `big-${i}`;
    learnerStmt.run(learner, `ST-B${i}`, '2026-10-01T00:00:00.000Z');
    for (let lesson = 0; lesson < 10; lesson++) {
      const day = 20 + (i % 7);
      const created = `2026-10-${String(day).padStart(2, '0')}T0${lesson % 9}:00:00.000Z`;
      attemptStmt.run(`bq-${++k}`, learner, lesson, lesson % 2, `big-cid-${k}-xx`, created);
      attemptStmt.run(`bq-${++k}`, learner, lesson, 1, `big-cid-${k}-xx`, created);
      progressStmt.run(learner, lesson, created, created);
    }
  }
  big.exec('COMMIT');
  const started = performance.now();
  const snap = await queries.loadDashboardSnapshot(bigDb, { granularity: 'week' });
  const elapsed = performance.now() - started;
  assert.equal(snap.learners.length, 500);
  assert.ok(elapsed < 1000, `truy vấn tổng hợp 500 học viên mất ${elapsed.toFixed(0)} ms, vượt 1 giây`);
  console.log(`  đo: ${snap.learners.length} học viên, ${k} lượt làm, ${elapsed.toFixed(0)} ms (SQLite trong bộ nhớ, chưa đo D1)`);
}

console.log('PASS: truy vấn báo cáo quản trị: chuỗi ngày/tuần khớp JavaScript qua mốc giờ Việt Nam, theo học viên, theo bài, khoảng thời gian có hai đầu, bộ lọc bài và nhóm, trước–sau, đầu vào sai, và 500 học viên dưới 1 giây');
