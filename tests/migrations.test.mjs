import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';

// Kiểm thử migration 0001 trên cơ sở dữ liệu rỗng và cơ sở dữ liệu có dữ liệu cũ
// (CLAUDE.md mục 5: migration phải chạy được trên cả hai; bật foreign_keys; theo dõi user_version).

const columns = (sql, table) => sql.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
const tryRun = (fn) => { try { fn(); return null; } catch (error) { return String(error.message); } };

// 1) Cơ sở dữ liệu rỗng: áp dụng đủ mọi migration.
{
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  const tags = applyMigrations(sql);
  assert.equal(tags.length, 5, 'journal phải có 5 migration (0000–0004)');
  assert.ok(columns(sql, 'quiz_attempts').includes('client_id'), 'quiz_attempts.client_id phải tồn tại (0004)');
  assert.ok(columns(sql, 'assessments').includes('client_id'), 'assessments.client_id phải tồn tại');
  assert.ok(columns(sql, 'videos').includes('kind'), 'videos.kind phải tồn tại');
  assert.ok(columns(sql, 'videos').includes('url'), 'videos.url phải tồn tại');
  assert.ok(columns(sql, 'lessons').includes('body'), 'bảng lessons phải tồn tại');
  assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length, 0);
}

// 2) Cơ sở dữ liệu có dữ liệu cũ: chèn dữ liệu theo schema 0000, rồi áp dụng 0001.
{
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sql, { to: 1 });
  sql.prepare("INSERT INTO learners (id, code, created) VALUES ('l1','ABC123','2026-01-01T00:00:00Z')").run();
  sql.prepare("INSERT INTO progress (learner, lesson, read, done, score, updated) VALUES ('l1',0,1,1,3,'2026-01-02T00:00:00Z')").run();
  sql.prepare("INSERT INTO assessments (id, learner, phase, scores, assessor, created) VALUES ('a1','l1','Trước học','[0,1,2,3,null]','owner','2026-01-03T00:00:00Z')").run();
  sql.prepare("INSERT INTO videos (lesson, key, mime, duration, updated) VALUES (1,'videos/lesson-01.mp4','video/mp4',120,'2026-01-04T00:00:00Z')").run();

  applyMigrations(sql, { from: 1 });

  assert.deepEqual({ ...sql.prepare('SELECT learner, lesson, read, done, score, updated FROM progress').get() }, { learner: 'l1', lesson: 0, read: 1, done: 1, score: 3, updated: '2026-01-02T00:00:00Z' }, 'tiến độ cũ phải giữ nguyên');
  assert.equal(sql.prepare("SELECT client_id FROM assessments WHERE id='a1'").get().client_id, null, 'phiếu cũ có client_id NULL');
  const video = sql.prepare('SELECT key, kind, url FROM videos WHERE lesson = 1').get();
  assert.equal(video.key, 'videos/lesson-01.mp4', 'khóa R2 cũ phải giữ nguyên');
  assert.equal(video.kind, 'file', 'video cũ mặc định kind = file');
  assert.equal(video.url, null, 'video cũ không có url');
  assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length, 0);
}

// 3) Ràng buộc idempotency: cùng (learner, client_id) không được tạo hai phiếu.
{
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sql);
  sql.prepare("INSERT INTO learners (id, code, created) VALUES ('l1','ABC123','2026-01-01T00:00:00Z')").run();
  const insert = (id, clientId) => sql.prepare("INSERT INTO assessments (id, learner, phase, scores, assessor, created, client_id) VALUES (?,'l1','Trước học','[0,0,0,0,0]','owner','2026-01-03T00:00:00Z',?)").run(id, clientId);
  insert('a1', 'c-1');
  assert.notEqual(tryRun(() => insert('a2', 'c-1')), null, 'trùng (learner, client_id) phải bị từ chối');
  insert('a3', 'c-2');
  insert('a4', null);
  insert('a5', null);
}

// 4) Ràng buộc FK: phiếu không được trỏ tới học viên không tồn tại.
{
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sql);
  const error = tryRun(() => sql.prepare("INSERT INTO assessments (id, learner, phase, scores, assessor, created) VALUES ('x','ghost','Trước học','[]','owner','2026-01-01T00:00:00Z')").run());
  assert.notEqual(error, null, 'FK assessments.learner phải được thực thi');
}

// 5) CHECK bài học: lesson 0–9, group_no 1–5.
{
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  // Chỉ đến 0001: 0002 đã seed 10 bài, ở đây kiểm CHECK của bảng nên cần bảng trống.
  applyMigrations(sql, { to: 2 });
  const insertLesson = (lesson, group) => sql.prepare("INSERT INTO lessons (lesson, title, group_no, body, quiz, created) VALUES (?, 'T', ?, '[]', '[]', '2026-01-01T00:00:00Z')").run(lesson, group);
  insertLesson(0, 1);
  insertLesson(9, 5);
  assert.notEqual(tryRun(() => insertLesson(10, 1)), null, 'lesson 10 phải bị từ chối');
  assert.notEqual(tryRun(() => insertLesson(1, 0)), null, 'group_no 0 phải bị từ chối');
  assert.notEqual(tryRun(() => insertLesson(2, 6)), null, 'group_no 6 phải bị từ chối');
}

console.log('PASS: migration 0001 trên DB rỗng và DB có dữ liệu cũ, ràng buộc idempotency, FK, CHECK bài học');
