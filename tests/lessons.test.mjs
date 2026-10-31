import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi } from './route-harness.mjs';
import ts from 'typescript';

// Kiểm thử Commit 1.4: seed bài học qua migration 0002, validation, API chỉ đọc (CLAUDE.md mục 4.4, 7).
// Module shared/ được nạp trực tiếp bằng transpile để so sánh với dữ liệu trong DB.

// Nạp shared/ trong thư mục tạm, cùng cách với harness, để test dùng đúng mã nguồn TypeScript.
const sharedDir = mkdtempSync(join(tmpdir(), 'son-tra-so-shared-'));
try {
  for (const file of readdirSync('shared').filter((name) => name.endsWith('.ts'))) {
    const js = ts.transpileModule(readFileSync(join('shared', file), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText;
    writeFileSync(join(sharedDir, file.replace(/\.ts$/, '.mjs')), js.replace(/from '\.\/([\w-]+)'/g, "from './$1.mjs'"));
  }
} catch (error) {
  rmSync(sharedDir, { recursive: true, force: true });
  throw error;
}
const { LESSONS_SEED, LESSON_GROUP_NAMES } = await import(pathToFileURL(join(sharedDir, 'lessons-seed.mjs')).href);
const { checkLessonSeed, toLessonRow, toLessonResponse } = await import(pathToFileURL(join(sharedDir, 'lesson-validation.mjs')).href);
rmSync(sharedDir, { recursive: true, force: true });

const freshDb = () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  return sql;
};
const rowsOf = (sql) => sql.prepare('SELECT lesson, title, group_no, body, quiz, next_step FROM lessons ORDER BY lesson').all().map((r) => ({ ...r }));

// 1) Dữ liệu seed hợp lệ, đúng số lượng và thứ tự.
assert.equal(LESSONS_SEED.length, 10, 'phải có đúng 10 bài');
LESSONS_SEED.forEach((item, index) => {
  assert.equal(item.lesson, index, 'lesson phải liên tục 0–9 theo thứ tự');
  const check = checkLessonSeed(item);
  assert.deepEqual(check, { ok: true }, `bài ${index} phải hợp lệ`);
});
assert.equal(LESSON_GROUP_NAMES.length, 5);

// 2) Migration 0002 trên DB có đủ 0000–0001 seed đúng từng trường, và khớp dữ liệu chuẩn.
{
  const sql = freshDb();
  applyMigrations(sql);
  const rows = rowsOf(sql);
  assert.equal(rows.length, 10, '0002 phải seed đúng 10 bài');
  rows.forEach((row, index) => {
    const expected = toLessonRow(LESSONS_SEED[index]);
    assert.equal(row.lesson, expected.lesson);
    assert.equal(row.title, expected.title);
    assert.equal(row.group_no, expected.group_no);
    assert.deepEqual(JSON.parse(row.body), JSON.parse(expected.body), `body bài ${index}`);
    assert.deepEqual(JSON.parse(row.quiz), JSON.parse(expected.quiz), `quiz bài ${index}`);
    assert.equal(row.next_step, expected.next_step);
  });
}

// 3) Idempotent: chạy lại đúng câu lệnh seed không tạo bản trùng và không báo lỗi.
{
  const sql = freshDb();
  // Chỉ áp dụng đến 0002: câu lệnh seed là migration lịch sử, chạy trên schema trước 0010 (cột updated).
  applyMigrations(sql, { to: 3 });
  const seedSql = readFileSync('drizzle/0002_seed_bai_hoc.sql', 'utf8').replaceAll('--> statement-breakpoint', '');
  sql.exec(seedSql);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM lessons').get().n, 10, 'chạy lại seed không được tạo bản trùng');
}

// 4) Nâng cấp từ DB có dữ liệu cũ: tiến độ hiện có vẫn đọc được sau khi áp dụng 0002.
{
  const sql = freshDb();
  applyMigrations(sql, { to: 2 });
  sql.prepare("INSERT INTO learners (id, code, created) VALUES ('l1','ABC123','2026-01-01T00:00:00Z')").run();
  sql.prepare("INSERT INTO progress (learner, lesson, read, done, score, updated) VALUES ('l1',9,1,0,1,'2026-01-02T00:00:00Z')").run();
  applyMigrations(sql, { from: 2 });
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM lessons').get().n, 10);
  assert.equal(sql.prepare("SELECT lesson, read FROM progress WHERE learner='l1'").get().lesson, 9, 'tiến độ cũ không đổi');
}

// 5) Validation từ chối từng lỗi cấu trúc.
{
  const base = LESSONS_SEED[0];
  const cases = [
    [{ ...base, lesson: 1000 }, 'Mã bài'],
    [{ ...base, groupNo: 0 }, 'Nhóm'],
    [{ ...base, groupNo: 6 }, 'Nhóm'],
    [{ ...base, title: '   ' }, 'Tiêu đề'],
    [{ ...base, steps: [] }, 'Số bước'],
    [{ ...base, steps: Array(11).fill('x') }, 'Số bước'],
    [{ ...base, quiz: { ...base.quiz, answer: 3 } }, 'Chỉ số đáp án'],
    [{ ...base, quiz: { ...base.quiz, answer: -1 } }, 'Chỉ số đáp án'],
    [{ ...base, quiz: { ...base.quiz, options: ['a'] } }, 'Số đáp án'],
    [{ ...base, nextStep: '' }, 'Bước tiếp theo'],
  ];
  for (const [item, expectedWord] of cases) {
    const check = checkLessonSeed(item);
    assert.equal(check.ok, false, `phải từ chối: ${expectedWord}`);
    assert.ok(check.error.includes(expectedWord), `thông báo phải nói về: ${expectedWord}`);
  }
}

// 6) Hàng hỏng không được chuyển thành dữ liệu API.
{
  assert.equal(toLessonResponse({ lesson: 0, title: 'T', group_no: 1, body: 'không phải JSON', quiz: '{}', next_step: 'x' }), null);
}

// 7) API GET /api/lessons: công khai, đúng thứ tự, đúng dữ liệu seed, không cần đăng nhập.
{
  const sql = freshDb();
  applyMigrations(sql);
  const api = await loadApi(sql);
  const response = await api.GET(new Request('https://site.test/api/lessons'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.groups, [...LESSON_GROUP_NAMES]);
  assert.equal(body.lessons.length, 10);
  body.lessons.forEach((lesson, index) => {
    const seed = LESSONS_SEED[index];
    assert.equal(lesson.lesson, index);
    assert.equal(lesson.title, seed.title);
    assert.equal(lesson.group_no, seed.groupNo);
    assert.equal(lesson.icon, seed.icon);
    assert.equal(lesson.summary, seed.summary);
    assert.deepEqual(lesson.steps, seed.steps);
    // Mục 2 (quyết định 2): GET /api/lessons không được chứa đáp án; máy chủ chấm trong POST /api/quiz/answer.
    assert.deepEqual(lesson.quiz, { question: seed.quiz.question, options: seed.quiz.options });
    assert.equal('answer' in lesson.quiz, false, 'quiz.answer không được có trong phản hồi công khai');
    assert.equal(lesson.next_step, seed.nextStep);
  });

  // 8) API chỉ đọc: ghi bài học bị từ chối, dữ liệu không đổi (quy tắc 4.4).
  const postAsVolunteer = await api.POST(new Request('https://site.test/api/lessons', {
    method: 'POST',
    headers: { origin: 'https://site.test', 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@example.test' },
    body: JSON.stringify({ lesson: 0, title: 'Bị sửa' }),
  }));
  assert.equal(postAsVolunteer.status, 404, 'không có endpoint ghi cho bài học');
  assert.equal(rowsOf(sql)[0].title, LESSONS_SEED[0].title, 'bài học không được đổi qua API');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM lessons').get().n, 10);
}

// 9) Thiếu bài hoặc hàng hỏng: API trả 503, không trả danh sách dở dang.
{
  const sql = freshDb();
  applyMigrations(sql);
  const api = await loadApi(sql);
  // Mã bài không còn liên tục (quyết định 30/10/2026): thiếu bài 4 không còn là lỗi, API trả các bài còn lại.
  sql.prepare('DELETE FROM lessons WHERE lesson = 4').run();
  const afterDelete = await api.GET(new Request('https://site.test/api/lessons'));
  assert.equal(afterDelete.status, 200, 'thiếu một mã bài vẫn trả danh mục còn lại');
  assert.equal((await afterDelete.json()).lessons.length, 9);

  sql.prepare("INSERT INTO lessons (lesson, title, group_no, body, quiz, next_step, created, updated, hidden) VALUES (4,'T',1,'hỏng','{}','x','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',0)").run();
  assert.equal((await api.GET(new Request('https://site.test/api/lessons'))).status, 503, 'hàng hỏng phải trả 503');
}

// 10) Bảng rỗng (chưa seed): trả 503 để giao diện báo lỗi, không hiện trang trống giả.
{
  const sql = freshDb();
  applyMigrations(sql);
  sql.prepare('DELETE FROM lessons').run();
  const api = await loadApi(sql);
  assert.equal((await api.GET(new Request('https://site.test/api/lessons'))).status, 503);
}

console.log('PASS: seed 0002 đúng và idempotent, nâng cấp giữ tiến độ, validation, API bài học chỉ đọc, 503 khi dữ liệu thiếu hoặc hỏng');
