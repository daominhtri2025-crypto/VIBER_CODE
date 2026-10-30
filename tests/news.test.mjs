import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi, loadShared } from './route-harness.mjs';
import { ownerCookie, volunteerCookie, ORIGIN } from './auth-helper.mjs';

// Kiểm thử tin tức trang chủ (migration 0007; CLAUDE.md mục 4, 7). Dùng SQLite thật và route.ts thật.
// Quy tắc: chỉ quản trị viên đăng và sửa; tin ẩn không công khai; liên kết nguồn chỉ https; không nhận thời điểm từ client.

const { checkSourceUrl, validateNewsInput, validateNewsId } = await loadShared('news-rules');

// 1) Liên kết nguồn: chỉ https, không có thông tin đăng nhập, tối đa 500 ký tự.
{
  assert.deepEqual(checkSourceUrl(''), { ok: true, value: null }, 'trống nghĩa là không có nguồn');
  assert.equal(checkSourceUrl('https://example.test/tin-1').ok, true);
  assert.equal(checkSourceUrl('http://example.test/tin-1').ok, false, 'http bị từ chối');
  assert.equal(checkSourceUrl('javascript:alert(1)').ok, false, 'giao thức javascript bị từ chối');
  assert.equal(checkSourceUrl('https://nguoi:matkhau@example.test/').ok, false, 'thông tin đăng nhập trong URL bị từ chối');
  assert.equal(checkSourceUrl('https://example.test/' + 'a'.repeat(500)).ok, false, 'URL trên 500 ký tự bị từ chối');
  assert.equal(checkSourceUrl(42).ok, false, 'kiểu không phải chuỗi bị từ chối');
}

// 2) Dữ liệu đăng tin: tiêu đề bắt buộc, giới hạn độ dài, trường ẩn phải là boolean.
{
  assert.equal(validateNewsInput({ title: '   ' }).ok, false, 'tiêu đề toàn khoảng trắng bị từ chối');
  assert.equal(validateNewsInput({ title: 'a'.repeat(201) }).ok, false, 'tiêu đề 201 ký tự bị từ chối');
  assert.equal(validateNewsInput({ title: 'ok', content: 'x'.repeat(5001) }).ok, false, 'nội dung 5001 ký tự bị từ chối');
  assert.equal(validateNewsInput({ title: 'ok', hidden: 'yes' }).ok, false, 'hidden không phải boolean bị từ chối');
  assert.equal(validateNewsInput(null).ok, false);
  const valid = validateNewsInput({ title: '  Tin mới  ', summary: 'Tóm tắt' });
  assert.deepEqual(valid.value, { title: 'Tin mới', summary: 'Tóm tắt', content: '', sourceUrl: null, hidden: false }, 'cắt khoảng trắng và mặc định hidden = false');
}

// 3) Mã tin khi sửa: chỉ số nguyên dương.
{
  for (const bad of [0, -1, '3', 1.5, null]) assert.equal(validateNewsId(bad).ok, false, `mã ${JSON.stringify(bad)} bị từ chối`);
  assert.equal(validateNewsId(3).value, 3);
}

// 4) API thật trên SQLite thật.
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
applyMigrations(sql);
const api = await loadApi(sql);
const admin = await ownerCookie(api);
const volunteer = await volunteerCookie(api, 'tinh-nguyen-tin@example.test');

const post = (path, body, cookie, origin = ORIGIN) => api.POST(new Request(`${ORIGIN}${path}`, {
  method: 'POST',
  headers: { origin, 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
}));
const getJson = async (path, cookie) => {
  const res = await api.GET(new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} }));
  return { status: res.status, body: await res.json() };
};

// 4a) Ai được đăng: quản trị viên có phiên; tình nguyện viên, khách và cross-origin bị từ chối.
{
  const payload = { title: 'Tin thử', summary: 'Tóm tắt', content: 'Nội dung', source_url: 'https://example.test/a' };
  assert.equal((await post('/api/admin/news', payload, null)).status, 401, 'khách chưa đăng nhập bị 401');
  assert.equal((await post('/api/admin/news', payload, volunteer)).status, 403, 'tình nguyện viên không được đăng tin');
  assert.equal((await post('/api/admin/news', payload, admin, 'https://evil.test')).status, 403, 'Origin sai bị 403');
  assert.equal((await post('/api/admin/news', { ...payload, source_url: 'http://example.test' }, admin)).status, 400, 'nguồn http bị 400');
  assert.equal((await post('/api/admin/news', { summary: 'thiếu tiêu đề' }, admin)).status, 400, 'thiếu tiêu đề bị 400');
  console.log('PASS: quyền đăng tin (chỉ quản trị viên, Origin, dữ liệu sai bị 400)');
}

// 4b) Đăng hai tin công khai; danh sách công khai hiển thị tin mới nhất trước.
let firstId;
{
  const first = await post('/api/admin/news', { title: 'Tin cũ', summary: 's1', content: 'c1' }, admin);
  assert.equal(first.status, 201);
  firstId = (await first.json()).id;
  const second = await post('/api/admin/news', { title: 'Tin mới', summary: 's2', content: 'c2' }, admin);
  assert.equal(second.status, 201);
  const pub = await getJson('/api/news');
  assert.equal(pub.status, 200);
  assert.deepEqual(pub.body.news.map((n) => n.title), ['Tin mới', 'Tin cũ'], 'tin mới nhất đứng đầu');
  assert.equal(pub.body.news[0].hidden, false);
  console.log('PASS: đăng tin và danh sách công khai theo thứ tự mới nhất trước');
}

// 4c) Tin ẩn không xuất hiện công khai; quản trị vẫn thấy; khách không xem được danh sách quản trị.
{
  const hidden = await post('/api/admin/news', { title: 'Tin ẩn', hidden: true }, admin);
  assert.equal(hidden.status, 201);
  const pub = await getJson('/api/news');
  assert.ok(!pub.body.news.some((n) => n.title === 'Tin ẩn'), 'tin ẩn không được trả qua đường công khai');
  const adminList = await getJson('/api/admin/news', admin);
  assert.ok(adminList.body.news.some((n) => n.title === 'Tin ẩn' && n.hidden === true), 'quản trị thấy tin ẩn');
  assert.equal((await getJson('/api/admin/news', volunteer)).status, 403, 'tình nguyện viên không xem được danh sách quản trị');
  assert.equal((await getJson('/api/admin/news')).status, 401, 'khách không xem được danh sách quản trị');
  console.log('PASS: tin ẩn không công khai; danh sách quản trị giới hạn đúng vai trò');
}

// 4d) Sửa tin: quyền, mã không tồn tại, ẩn tin đang hiển thị; không đổi thời điểm đăng.
{
  const before = (await getJson('/api/admin/news', admin)).body.news.find((n) => n.id === firstId);
  const update = (body, cookie) => api.POST(new Request(`${ORIGIN}/api/admin/news/update`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));
  assert.equal((await update({ id: firstId, title: 'x' }, volunteer)).status, 403, 'tình nguyện viên không được sửa tin');
  assert.equal((await update({ id: firstId, title: 'x' }, null)).status, 401, 'khách không được sửa tin');
  assert.equal((await update({ id: 99999, title: 'x' }, admin)).status, 404, 'mã không tồn tại trả 404, không tạo bản mới');
  assert.equal((await update({ id: 'abc', title: 'x' }, admin)).status, 400, 'mã không phải số bị 400');
  assert.equal((await update({ id: firstId, title: 'Tin cũ đã sửa', hidden: true }, admin)).status, 200);
  const pub = await getJson('/api/news');
  assert.ok(!pub.body.news.some((n) => n.id === firstId), 'tin vừa ẩn biến mất khỏi danh sách công khai');
  const after = (await getJson('/api/admin/news', admin)).body.news.find((n) => n.id === firstId);
  assert.equal(after.title, 'Tin cũ đã sửa');
  assert.equal(after.published_at, before.published_at, 'sửa tin không đổi thời điểm đăng');
  console.log('PASS: sửa và ẩn tin đúng quyền; sửa không đổi thời điểm đăng');
}

// 4e) Lớp CSDL cũng từ chối liên kết không https, kể cả khi bỏ qua route.
{
  assert.throws(() => sql.prepare("INSERT INTO news (title,summary,content,source_url,hidden,published_at,created,updated) VALUES ('t','','','http://x.test',0,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')").run(), /CHECK/);
  console.log('PASS: ràng buộc CSDL từ chối liên kết nguồn không phải https');
}
