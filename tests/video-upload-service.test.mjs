import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { createD1Adapter, loadShared } from './route-harness.mjs';

// Kiểm thử storeUploadedVideo (shared/video-service.ts): mọi nhánh lỗi và thứ tự ghi/xóa.
// Dùng SQLite thật qua adapter D1 và kho R2 giả lập có ghi nhật ký thao tác (CLAUDE.md mục 2B.11, 7).

const { storeUploadedVideo } = await loadShared('video-service');
const MB = 1024 * 1024;
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(16)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84]), Buffer.from('webm'), Buffer.alloc(20)]);
const NEW_ID = 'new-id';

function freshDb() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sql);
  return { sql, db: createD1Adapter(sql) };
}

// Kho giả lập: ghi lại từng thao tác theo thứ tự, và có thể cho lỗi ở put hoặc delete.
function fakeStorage({ failPut = false } = {}) {
  const log = [];
  return {
    log,
    async put(key, body, contentType) {
      if (failPut) throw new Error('r2 put failed');
      log.push(['put', key, contentType]);
    },
    async delete(key) {
      log.push(['delete', key]);
    },
  };
}

function fakeFile(bytes, { size = bytes.length, onHead = () => {} } = {}) {
  return {
    size,
    async head(length) {
      onHead(length);
      return new Uint8Array(bytes.slice(0, length));
    },
    stream: () => 'stream-token',
  };
}

const ids = { newId: NEW_ID, now: '2026-10-29T00:00:00.000Z' };
const validInput = (overrides = {}) => ({ lesson: 3, duration: 29.2, file: fakeFile(MP4), ...overrides });

// 1) Thông tin tải lên sai: từ chối trước khi đọc chữ ký, không ghi R2, không đụng DB.
{
  const cases = [
    [{ lesson: 10 }, 400, 'Bài học phải nằm trong 0–9'],
    [{ lesson: 'x' }, 400, 'Bài học phải nằm trong 0–9'],
    [{ duration: 0 }, 400, 'Video phải dưới 2 phút'],
    [{ duration: 120 }, 400, 'Video phải dưới 2 phút'],
    [{ duration: Number.NaN }, 400, 'Video phải dưới 2 phút'],
  ];
  for (const [overrides, status, error] of cases) {
    const { db } = freshDb();
    const storage = fakeStorage();
    let headCalls = 0;
    const input = validInput({ ...overrides, file: fakeFile(MP4, { onHead: () => { headCalls += 1; } }) });
    const outcome = await storeUploadedVideo(db, storage, input, ids);
    assert.deepEqual(outcome, { kind: 'rejected', status, error }, `thông tin sai ${JSON.stringify(overrides)}`);
    assert.equal(headCalls, 0, 'thông tin sai phải bị loại trước khi đọc chữ ký');
    assert.deepEqual(storage.log, [], 'không được ghi R2 khi thông tin sai');
  }
}

// 2) Dung lượng: 0 byte bị từ chối; trên 25 MB bị 413 ngay, không đọc nội dung.
{
  const { db } = freshDb();
  const storage = fakeStorage();
  const empty = await storeUploadedVideo(db, storage, validInput({ file: fakeFile([], { size: 0 }) }), ids);
  assert.deepEqual(empty, { kind: 'rejected', status: 400, error: 'Tệp video trống' });

  let headCalls = 0;
  const big = fakeFile(MP4, { size: 25 * MB + 1, onHead: () => { headCalls += 1; } });
  const outcome = await storeUploadedVideo(db, storage, validInput({ file: big }), ids);
  assert.deepEqual(outcome, { kind: 'rejected', status: 413, error: 'Tệp tối đa 25 MB' });
  assert.equal(headCalls, 0, 'tệp quá lớn không được đọc nội dung');
  assert.deepEqual(storage.log, []);

  // Đúng 25 MB là hợp lệ về dung lượng.
  const exact = await storeUploadedVideo(db, storage, validInput({ file: fakeFile(MP4, { size: 25 * MB }) }), ids);
  assert.equal(exact.kind, 'stored', 'đúng 25 MB phải được chấp nhận');
}

// 3) Định dạng: văn bản đổi tên .mp4, WAV, và MKV bị từ chối; DB không đổi, R2 không được ghi.
{
  const fakes = {
    text: Buffer.from('hello world, đây là văn bản'),
    wav: Buffer.from('RIFF\0\0\0\0WAVEfmt '),
    mkv: Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x88]), Buffer.from('matroska')]),
  };
  for (const [name, bytes] of Object.entries(fakes)) {
    const { sql, db } = freshDb();
    const storage = fakeStorage();
    const outcome = await storeUploadedVideo(db, storage, validInput({ file: fakeFile(bytes) }), ids);
    assert.deepEqual(outcome, { kind: 'rejected', status: 400, error: 'Tệp không phải MP4 hoặc WebM hợp lệ' }, `${name} phải bị từ chối`);
    assert.deepEqual(storage.log, [], `${name}: không được ghi R2`);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM videos').get().n, 0, `${name}: DB không được đổi`);
  }
}

// 4) Thành công: ghi R2 với key theo bài và Content-Type từ chữ ký; DB lưu đúng mime, thời lượng làm tròn lên.
{
  const { sql, db } = freshDb();
  const storage = fakeStorage();
  const outcome = await storeUploadedVideo(db, storage, validInput({ file: fakeFile(WEBM), duration: 29.2 }), ids);
  assert.deepEqual(outcome, { kind: 'stored', key: `videos/3/${NEW_ID}`, mime: 'video/webm' });
  assert.deepEqual(storage.log, [['put', `videos/3/${NEW_ID}`, 'video/webm']]);
  const row = sql.prepare('SELECT key,mime,duration,kind FROM videos WHERE lesson=3').get();
  assert.deepEqual({ ...row }, { key: `videos/3/${NEW_ID}`, mime: 'video/webm', duration: 30, kind: 'file' });
}

// 5) Thay tệp: ghi tệp mới trước, xóa tệp cũ sau cùng, đúng một lần.
{
  const { sql, db } = freshDb();
  sql.prepare("INSERT INTO videos(lesson,key,mime,duration,updated,kind,url) VALUES(3,'videos/3/old','video/mp4',20,'2026-10-01T00:00:00.000Z','file',NULL)").run();
  const storage = fakeStorage();
  const outcome = await storeUploadedVideo(db, storage, validInput(), ids);
  assert.equal(outcome.kind, 'stored');
  assert.deepEqual(storage.log, [
    ['put', `videos/3/${NEW_ID}`, 'video/mp4'],
    ['delete', 'videos/3/old'],
  ], 'thứ tự bắt buộc: ghi tệp mới, rồi xóa tệp cũ');
  assert.equal(sql.prepare('SELECT key FROM videos WHERE lesson=3').get().key, `videos/3/${NEW_ID}`);
}

// 6) Lỗi ghi R2: ném lỗi, DB giữ nguyên tệp cũ, không xóa gì.
{
  const { sql, db } = freshDb();
  sql.prepare("INSERT INTO videos(lesson,key,mime,duration,updated,kind,url) VALUES(3,'videos/3/old','video/mp4',20,'2026-10-01T00:00:00.000Z','file',NULL)").run();
  const storage = fakeStorage({ failPut: true });
  await assert.rejects(storeUploadedVideo(db, storage, validInput(), ids), /r2 put failed/);
  assert.deepEqual(storage.log, [], 'lỗi ghi R2 không được kéo theo thao tác xóa');
  assert.equal(sql.prepare('SELECT key FROM videos WHERE lesson=3').get().key, 'videos/3/old', 'tệp cũ phải còn nguyên');
}

// 7) Lỗi DB sau khi ghi R2: xóa tệp mới vừa ghi, ném lỗi, không xóa tệp cũ.
{
  const { sql, db } = freshDb();
  sql.prepare("INSERT INTO videos(lesson,key,mime,duration,updated,kind,url) VALUES(3,'videos/3/old','video/mp4',20,'2026-10-01T00:00:00.000Z','file',NULL)").run();
  const failingDb = {
    prepare(query) {
      if (query.startsWith('INSERT INTO videos')) throw new Error('d1 unavailable');
      return db.prepare(query);
    },
  };
  const storage = fakeStorage();
  await assert.rejects(storeUploadedVideo(failingDb, storage, validInput(), ids), /d1 unavailable/);
  assert.deepEqual(storage.log, [
    ['put', `videos/3/${NEW_ID}`, 'video/mp4'],
    ['delete', `videos/3/${NEW_ID}`],
  ], 'DB lỗi: phải xóa tệp mới vừa ghi');
  assert.equal(sql.prepare('SELECT key FROM videos WHERE lesson=3').get().key, 'videos/3/old', 'tệp cũ không được xóa khi DB lỗi');
}

console.log('PASS: dịch vụ tải video: thông tin sai, dung lượng, định dạng, thành công, thay tệp đúng thứ tự, lỗi R2 và lỗi DB');
