import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { createD1Adapter, loadShared } from './route-harness.mjs';

// Kiểm thử dịch vụ danh tính (shared/identity-service.ts): tra cứu tình nguyện viên và mã học viên idempotent.
// Dùng SQLite thật qua adapter D1 (CLAUDE.md mục 7). Cờ quản trị và header vẫn do route xử lý.

const { isStaffEmail, ensureLearnerCode } = await loadShared('identity-service');

function freshDb() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sql);
  return { sql, db: createD1Adapter(sql) };
}

// 1) Tình nguyện viên: email chưa có trong staff thì false; thêm vào thì true; xóa đi thì false.
{
  const { sql, db } = freshDb();
  assert.equal(await isStaffEmail(db, 'vol@test.test'), false, 'email không có trong staff phải là false');
  sql.prepare("INSERT INTO staff(email,created) VALUES('vol@test.test','2026-10-01T00:00:00.000Z')").run();
  assert.equal(await isStaffEmail(db, 'vol@test.test'), true, 'email trong staff phải là true');
  assert.equal(await isStaffEmail(db, 'other@test.test'), false, 'email khác không được khớp');
  sql.prepare("DELETE FROM staff WHERE email='vol@test.test'").run();
  assert.equal(await isStaffEmail(db, 'vol@test.test'), false, 'xóa khỏi staff thì mất quyền');
}

// 2) Mã học viên: tạo một lần; gọi lại cùng danh tính trả cùng mã và không gọi newCode nữa.
{
  const { db, sql } = freshDb();
  let generated = 0;
  const newCode = () => { generated += 1; return `ST-TEST-${generated}`; };
  const first = await ensureLearnerCode(db, 'learner-a', newCode, '2026-10-29T00:00:00.000Z');
  assert.equal(first, 'ST-TEST-1');
  const again = await ensureLearnerCode(db, 'learner-a', newCode, '2026-10-29T01:00:00.000Z');
  assert.equal(again, 'ST-TEST-1', 'gọi lại phải trả đúng mã cũ');
  assert.equal(generated, 1, 'học viên đã có thì không được sinh mã mới');
  assert.equal(sql.prepare("SELECT created FROM learners WHERE id='learner-a'").get().created, '2026-10-29T00:00:00.000Z', 'thời điểm tạo không được đổi');
}

// 3) Hai danh tính khác nhau nhận hai mã khác nhau.
{
  const { db } = freshDb();
  let n = 0;
  const newCode = () => { n += 1; return `ST-${n}`; };
  const a = await ensureLearnerCode(db, 'learner-a', newCode, '2026-10-29T00:00:00.000Z');
  const b = await ensureLearnerCode(db, 'learner-b', newCode, '2026-10-29T00:00:00.000Z');
  assert.notEqual(a, b, 'mỗi học viên phải có mã riêng');
}

// 4) Đua nhau tạo: yêu cầu A tra cứu thấy chưa có học viên, nhưng khi INSERT thì yêu cầu B đã ghi bản ghi.
// INSERT OR IGNORE phải giữ mã của B, không được ghi đè (quy tắc idempotent).
{
  const { db, sql } = freshDb();
  // Mô phỏng yêu cầu B vừa ghi xong ngay trước INSERT của yêu cầu A.
  sql.prepare("INSERT INTO learners(id,code,created) VALUES('learner-race','ST-ORIGINAL','2026-10-01T00:00:00.000Z')").run();
  let firstLookupDone = false;
  const raceDb = {
    prepare(query) {
      const statement = db.prepare(query);
      const isInitialLookup = query.startsWith('SELECT code FROM learners') && !firstLookupDone;
      if (!isInitialLookup) return statement;
      firstLookupDone = true;
      // Lần tra cứu đầu tiên của A trả về "chưa có", dù bản ghi của B đã nằm trong bảng.
      return { bind: () => ({ first: async () => null }), first: async () => null };
    },
  };
  let generated = 0;
  const code = await ensureLearnerCode(raceDb, 'learner-race', () => { generated += 1; return 'ST-OTHER'; }, '2026-10-29T00:00:00.000Z');
  assert.equal(code, 'ST-ORIGINAL', 'khi đua nhau, bản ghi đã ghi trước phải được giữ nguyên mã');
  assert.equal(generated, 1, 'yêu cầu A đã sinh mã trước khi INSERT bị bỏ qua');
  assert.equal(sql.prepare("SELECT code FROM learners WHERE id='learner-race'").get().code, 'ST-ORIGINAL', 'DB không được bị ghi đè');
}

console.log('PASS: dịch vụ danh tính: tình nguyện viên theo bảng staff; mã học viên tạo một lần, idempotent, không đè bản ghi có sẵn');
