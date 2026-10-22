import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi, loadShared } from './route-harness.mjs';

// Kiểm thử Commit 1.5: liên kết video, kiểm tra định dạng và nguồn phát, thay video, dọn R2 (CLAUDE.md mục 4.5, 7;
// SRS FR-CNT-04, 05, 06, FR-LRN-08). Dùng SQLite thật và R2 giả lập có ghi lại thao tác.

const ORIGIN = 'https://site.test';
const YOUTUBE_ID = 'dQw4w9WgXcQ';
const EMBED = `https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}`;
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(16)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84]), Buffer.from('webm'), Buffer.alloc(20)]);

const { detectVideoFormat, checkVideoLink } = await loadShared('video-rules');

// 1) Nhận dạng định dạng theo chữ ký, không theo tên hay Content-Type.
{
  assert.equal(detectVideoFormat(new Uint8Array(MP4)), 'video/mp4');
  assert.equal(detectVideoFormat(new Uint8Array(WEBM)), 'video/webm');
  assert.equal(detectVideoFormat(new Uint8Array(Buffer.from('hello world, đây là văn bản'))), null, 'văn bản đổi tên .mp4 bị từ chối');
  assert.equal(detectVideoFormat(new Uint8Array(Buffer.from('RIFF\0\0\0\0WAVEfmt '))), null, 'WAV bị từ chối');
  assert.equal(detectVideoFormat(new Uint8Array(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x88]), Buffer.from('matroska')]))), null, 'MKV không phải WebM bị từ chối');
  const quickTime = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  '), Buffer.alloc(8)]);
  assert.equal(detectVideoFormat(new Uint8Array(quickTime)), null, 'brand QuickTime không nằm trong danh sách MP4 được duyệt');
}

// 2) Liên kết: chấp nhận đúng các dạng YouTube, chuẩn hóa sang youtube-nocookie; từ chối mọi quy tắc 4.5.
{
  for (const url of [
    `https://www.youtube.com/watch?v=${YOUTUBE_ID}&t=10`,
    `https://youtu.be/${YOUTUBE_ID}`,
    `https://m.youtube.com/shorts/${YOUTUBE_ID}`,
    `https://www.youtube.com/embed/${YOUTUBE_ID}`,
  ]) {
    const result = checkVideoLink({ lesson: 1, url });
    assert.equal(result.ok, true, `phải chấp nhận: ${url}`);
    assert.equal(result.embedUrl, EMBED);
  }

  const base = 'https://www.youtube.com/watch?v=' + YOUTUBE_ID + '&pad=';
  const exactly500 = base + 'a'.repeat(500 - base.length);
  assert.equal(checkVideoLink({ lesson: 1, url: exactly500 }).ok, true, 'đúng 500 ký tự phải được chấp nhận');

  const rejected = [
    [`http://youtu.be/${YOUTUBE_ID}`, 'không phải https'],
    ['javascript:alert(1)', 'không phải https'],
    [`https://user:pass@www.youtube.com/watch?v=${YOUTUBE_ID}`, 'có thông tin đăng nhập'],
    [`https://user@www.youtube.com/watch?v=${YOUTUBE_ID}`, 'có tên người dùng'],
    ['https://vimeo.com/123456789', 'host không phải YouTube'],
    [`https://www.youtube.com.evil.test/watch?v=${YOUTUBE_ID}`, 'host giả mạo'],
    [`https://www.youtube.com:8443/watch?v=${YOUTUBE_ID}`, 'có cổng'],
    ['https://www.youtube.com/watch?v=short', 'mã video sai độ dài'],
    ['https://www.youtube.com/channel/abc', 'không phải trang video'],
    [base + 'a'.repeat(501 - base.length), 'trên 500 ký tự'],
    ['https://', 'URL không hợp lệ'],
    ['', 'chuỗi rỗng'],
  ];
  for (const [url, why] of rejected) {
    const result = checkVideoLink({ lesson: 1, url });
    assert.equal(result.ok, false, `phải từ chối (${why}): ${url.slice(0, 60)}`);
  }
  assert.equal(checkVideoLink({ lesson: 1, url: 12345 }).ok, false, 'url không phải chuỗi');
  assert.equal(checkVideoLink({ lesson: 10, url: `https://youtu.be/${YOUTUBE_ID}` }).ok, false, 'lesson 10 bị từ chối');
}

// Bucket R2 giả lập: ghi lại put/delete; có thể cho put thất bại để kiểm tra việc giữ tệp cũ.
function fakeBucket() {
  const objects = new Map();
  const log = { puts: [], deletes: [] };
  const bucket = {
    objects,
    log,
    failPut: false,
    async put(key, value, options) {
      if (bucket.failPut) throw new Error('R2 unavailable');
      const bytes = new Uint8Array(await new Response(value).arrayBuffer());
      objects.set(key, { bytes, contentType: options.httpMetadata.contentType });
      log.puts.push({ key, contentType: options.httpMetadata.contentType });
      return {};
    },
    async get(key, options) {
      const object = objects.get(key);
      if (!object) return null;
      const range = options?.range?.get?.('range');
      if (range) {
        const match = /bytes=(\d+)-(\d+)/.exec(range);
        const start = Number(match[1]);
        const end = Number(match[2]);
        return { body: object.bytes.slice(start, end + 1), size: object.bytes.length, range: { offset: start, length: end - start + 1 } };
      }
      return { body: object.bytes, size: object.bytes.length };
    },
    async delete(key) {
      objects.delete(key);
      log.deletes.push(key);
    },
  };
  return bucket;
}

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
applyMigrations(sql);
const bucket = fakeBucket();
const api = await loadApi(sql, { bucket });

const owner = { id: 'owner', email: 'owner@example.test' };
const volunteer = { id: 'vol-1', email: 'v1@test.test' };

function request(method, path, identity, { json, form, origin = ORIGIN } = {}) {
  const headers = {};
  if (identity) {
    headers['oai-authenticated-user-id'] = identity.id;
    headers['oai-authenticated-user-email'] = identity.email;
  }
  if (method === 'POST') headers.origin = origin;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    body = form;
  }
  return new Request(`${ORIGIN}/api/${path}`, { method, headers, body });
}
const GET = (path, identity, options) => api.GET(request('GET', path, identity, options));
const POST = (path, identity, options) => api.POST(request('POST', path, identity, options));

function videoForm({ lesson = 2, duration = 30, bytes = MP4, type = 'video/mp4', name = 'clip.mp4' } = {}) {
  const form = new FormData();
  form.set('video', new File([bytes], name, { type }));
  form.set('lesson', String(lesson));
  form.set('duration', String(duration));
  return form;
}
const rowFor = (lesson) => sql.prepare('SELECT lesson, key, mime, duration, kind, url FROM videos WHERE lesson = ?').get(lesson);
const rowCount = (lesson) => sql.prepare('SELECT COUNT(*) AS n FROM videos WHERE lesson = ?').get(lesson).n;

// Thiết lập: cấp quyền tình nguyện viên cho một tài khoản.
assert.equal((await POST('staff', owner, { json: { email: volunteer.email } })).status, 200);

// 3) Liên kết qua API: quyền, Origin, và trạng thái công khai.
{
  assert.equal((await POST('video-link', null, { json: { lesson: 1, url: `https://youtu.be/${YOUTUBE_ID}` } })).status, 401, 'khách không được thêm liên kết');
  assert.equal((await POST('video-link', volunteer, { json: { lesson: 1, url: `https://youtu.be/${YOUTUBE_ID}` } })).status, 403, 'tình nguyện viên không được thêm liên kết');
  assert.equal((await POST('video-link', owner, { json: { lesson: 1, url: `https://youtu.be/${YOUTUBE_ID}` }, origin: 'https://evil.test' })).status, 403, 'sai Origin bị từ chối');
  assert.equal((await POST('video-link', owner, { json: { lesson: 1, url: `http://youtu.be/${YOUTUBE_ID}` } })).status, 400, 'http bị từ chối qua API');
  assert.equal((await POST('video-link', owner, { json: { lesson: 10, url: `https://youtu.be/${YOUTUBE_ID}` } })).status, 400, 'lesson 10 bị từ chối qua API');

  const created = await POST('video-link', owner, { json: { lesson: 1, url: `https://youtu.be/${YOUTUBE_ID}` } });
  assert.equal(created.status, 200);
  assert.equal(rowFor(1).kind, 'link');
  assert.equal(rowFor(1).url, EMBED, 'lưu URL đã chuẩn hóa sang youtube-nocookie');
  assert.equal(rowFor(1).duration, 0, 'liên kết có thời lượng 0 (không rõ)');
  assert.equal(rowFor(1).key, '', 'liên kết không có khóa R2');

  const list = await (await GET('videos')).json();
  const entry = list.find((v) => v.lesson === 1);
  assert.deepEqual({ kind: entry.kind, url: entry.url }, { kind: 'link', url: EMBED }, 'danh mục công khai có kind và url');

  assert.equal((await GET('video/1')).status, 404, 'bài dùng liên kết không phát qua /api/video/:lesson');
}

// 4) Tải tệp: định dạng lấy từ chữ ký, không từ Content-Type client gửi.
{
  const putsBefore = bucket.log.puts.length;
  const lying = await POST('upload-video', owner, { form: videoForm({ type: 'video/webm', bytes: MP4 }) });
  assert.equal(lying.status, 200);
  assert.equal(bucket.log.puts.at(-1).contentType, 'video/mp4', 'Content-Type lưu theo chữ ký, không theo client');
  assert.equal(rowFor(2).kind, 'file');
  assert.equal(rowFor(2).url, null);
  assert.equal(rowFor(2).mime, 'video/mp4');

  const served = await GET('video/2');
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'video/mp4');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');

  const ranged = await api.GET(new Request(`${ORIGIN}/api/video/2`, { headers: { range: 'bytes=0-3' } }));
  assert.equal(ranged.status, 206, 'Range trả 206');
  assert.match(ranged.headers.get('content-range'), /^bytes 0-3\/\d+$/);

  // Từ chối: văn bản đổi tên .mp4, WAV, tệp rỗng, quá 25 MB, quá 2 phút, bài không hợp lệ.
  const putsAfterValid = bucket.log.puts.length;
  assert.equal((await POST('upload-video', owner, { form: videoForm({ bytes: Buffer.from('hello, đây là văn bản') }) })).status, 400, 'văn bản .mp4 bị 400');
  assert.equal((await POST('upload-video', owner, { form: videoForm({ bytes: Buffer.from('RIFF\0\0\0\0WAVEfmt ') }) })).status, 400, 'WAV bị 400');
  assert.equal((await POST('upload-video', owner, { form: videoForm({ bytes: Buffer.alloc(0) }) })).status, 400, 'tệp rỗng bị 400');
  assert.equal((await POST('upload-video', owner, { form: videoForm({ duration: 120 }) })).status, 400, 'đúng 120 giây bị 400');
  assert.equal((await POST('upload-video', owner, { form: videoForm({ lesson: 10 }) })).status, 400, 'lesson 10 bị 400');
  assert.equal(bucket.log.puts.length, putsAfterValid, 'tệp không hợp lệ không được ghi vào R2');

  const oversized = Buffer.concat([MP4, Buffer.alloc(25 * 1024 * 1024 + 1 - MP4.length)]);
  assert.equal((await POST('upload-video', owner, { form: videoForm({ bytes: oversized }) })).status, 413, 'trên 25 MB bị 413 trước khi ghi');
  assert.equal(bucket.log.puts.length, putsAfterValid, 'tệp quá lớn không được ghi');
  assert.ok(putsBefore < bucket.log.puts.length);

  assert.equal((await POST('upload-video', volunteer, { form: videoForm() })).status, 403, 'tình nguyện viên không được tải video');
}

// 5) Thay video: một bài đúng một bản ghi; tệp R2 cũ chỉ bị xóa sau khi DB thành công.
{
  const first = await POST('upload-video', owner, { form: videoForm({ lesson: 3, name: 'a.mp4' }) });
  assert.equal(first.status, 200);
  const keyA = rowFor(3).key;

  assert.equal((await POST('video-link', owner, { json: { lesson: 3, url: `https://www.youtube.com/watch?v=${YOUTUBE_ID}` } })).status, 200);
  assert.equal(rowCount(3), 1, 'một bài chỉ có một bản ghi');
  assert.equal(rowFor(3).kind, 'link');
  assert.ok(bucket.log.deletes.includes(keyA), 'tệp cũ bị xóa sau khi chuyển sang liên kết');
  assert.equal(bucket.objects.has(keyA), false);

  const deletesBeforeB = bucket.log.deletes.length;
  assert.equal((await POST('upload-video', owner, { form: videoForm({ lesson: 3, name: 'b.mp4' }) })).status, 200);
  assert.equal(bucket.log.deletes.length, deletesBeforeB, 'chuyển từ liên kết sang tệp không xóa R2 nào');
  assert.equal(rowCount(3), 1);
  const keyB = rowFor(3).key;
  assert.equal(rowFor(3).kind, 'file');

  assert.equal((await POST('upload-video', owner, { form: videoForm({ lesson: 3, name: 'c.mp4' }) })).status, 200);
  assert.ok(bucket.log.deletes.includes(keyB), 'tệp B bị xóa sau khi thay bằng C');
  const keyC = rowFor(3).key;
  assert.ok(bucket.objects.has(keyC), 'tệp C còn trong R2');
  assert.equal(rowCount(3), 1);

  // Lỗi R2 khi ghi tệp mới: DB và tệp cũ không đổi.
  bucket.failPut = true;
  assert.equal((await POST('upload-video', owner, { form: videoForm({ lesson: 3, name: 'd.mp4' }) })).status, 503);
  bucket.failPut = false;
  assert.equal(rowFor(3).key, keyC, 'DB giữ nguyên khi ghi R2 lỗi');
  assert.ok(bucket.objects.has(keyC), 'tệp cũ còn khi ghi mới thất bại');
  assert.equal(bucket.log.deletes.includes(keyC), false, 'không xóa tệp cũ khi ghi mới thất bại');
}

// 6) Danh mục công khai: không lộ dữ liệu nội bộ; mọi bài có tối đa một bản ghi.
{
  const list = await (await GET('videos')).json();
  assert.ok(list.every((v) => Object.keys(v).sort().join(',') === 'duration,kind,lesson,updated,url'), 'danh mục không có khóa R2 hay mime');
  const lessons = list.map((v) => v.lesson);
  assert.equal(new Set(lessons).size, lessons.length, 'không có bài trùng trong danh mục');
}

console.log('PASS: kiểm tra định dạng theo chữ ký, liên kết YouTube (https, không thông tin đăng nhập, ≤500 ký tự), tải tệp (413/400, không ghi tệp không hợp lệ), thay video và dọn R2 sau khi DB thành công, phát Range và chặn bài liên kết');
