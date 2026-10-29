import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi, loadShared, TEST_ADMIN_PASSWORD } from './route-harness.mjs';
import { ORIGIN, OWNER_EMAIL, loginCookie, ownerCookie } from './auth-helper.mjs';

// Kiểm thử xác thực quản trị viên và tình nguyện viên (SRS FR-AUTH; CLAUDE.md mục 2, 4, 7).
// Chạy route.ts thật trên SQLite thật. Mỗi khối dùng email riêng để các bộ đếm đăng nhập không lẫn nhau.

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
applyMigrations(sql);
const api = await loadApi(sql);

const TEMP = 'mat-khau-tam-1234';
const NEW_PW = 'mat-khau-moi-1234';
const SECRET_CHECK = ['mat-khau-tam-1234', 'mat-khau-moi-1234', TEST_ADMIN_PASSWORD];

const req = (method, path, { json, cookie, headers = {} } = {}) => new Request(`${ORIGIN}/api/${path}`, {
  method,
  headers: { ...(method === 'POST' ? { origin: ORIGIN, 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
  body: json === undefined ? undefined : JSON.stringify(json),
});
const GET = (path, options) => api.GET(req('GET', path, options));
const POST = (path, options) => api.POST(req('POST', path, options));
const login = (email, password) => POST('auth/login', { json: { email, password } });
const countSessions = (accountId) => sql.prepare('SELECT COUNT(*) AS n FROM sessions WHERE account_id = ?').get(accountId).n;
const accountOf = (email) => sql.prepare('SELECT * FROM accounts WHERE email = ?').get(email);
const admin = () => ownerCookie(api);

// Tạo tài khoản tình nguyện viên, đăng nhập bằng mật khẩu tạm, đổi sang mật khẩu mới; trả cookie phiên đã kích hoạt.
async function activeVolunteer(email) {
  const created = await POST('accounts', { cookie: await admin(), json: { email, password: TEMP } });
  assert.equal(created.status, 201, `tạo ${email}`);
  const temp = await loginCookie(api, email, TEMP);
  assert.ok(temp, 'đăng nhập bằng mật khẩu tạm');
  const changed = await POST('auth/password', { cookie: temp, json: { current: TEMP, next: NEW_PW } });
  assert.equal(changed.status, 200, 'đổi mật khẩu lần đầu');
  return loginCookie(api, email, NEW_PW);
}

// Học viên mẫu để kiểm tra việc ghi phiếu quan sát.
sql.prepare('INSERT INTO learners(id, code, created) VALUES (?, ?, ?)').run('auth-learner', 'ST-AUTH-1', '2026-10-01T00:00:00.000Z');
const assessmentBody = (clientId) => ({ client_id: clientId, code: 'ST-AUTH-1', phase: 'Trước học', scores: [0, 1, 2, 3, null], observed: true });

// 1) Chính sách mật khẩu: tối thiểu 10, tối đa 200 ký tự (quyết định ngày 2026-10-29).
{
  const cookie = await admin();
  assert.equal((await POST('accounts', { cookie, json: { email: 'chinh-sach@test.test', password: 'a'.repeat(9) } })).status, 400);
  assert.equal((await POST('accounts', { cookie, json: { email: 'chinh-sach@test.test', password: 'a'.repeat(201) } })).status, 400);
  assert.equal((await POST('accounts', { cookie, json: { email: 'chinh-sach@test.test', password: 'a'.repeat(10) } })).status, 201);
  assert.equal((await POST('accounts', { cookie, json: { email: 'chinh-sach@test.test', password: TEMP } })).status, 409, 'email trùng bị từ chối');
}

// 2) Đăng nhập sai: email không tồn tại và mật khẩu sai trả cùng một phản hồi; phản hồi không chứa mật khẩu gửi lên.
{
  const wrongPassword = await login('chinh-sach@test.test', 'sai-mat-khau-xyz');
  const unknownEmail = await login('khong-co@test.test', 'sai-mat-khau-xyz');
  const bodyA = await wrongPassword.json();
  const bodyB = await unknownEmail.json();
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual(bodyA, bodyB, 'không được lộ email có tồn tại hay không');
  assert.equal(JSON.stringify(bodyA).includes('sai-mat-khau-xyz'), false);
}

// 3) Khóa tạm sau 5 lần sai liên tiếp (423); mật khẩu đúng vẫn bị khóa; hết hạn thì đăng nhập được và bộ đếm về 0.
{
  const email = 'khoa-tam@test.test';
  await POST('accounts', { cookie: await admin(), json: { email, password: TEMP } });
  for (let i = 1; i <= 4; i += 1) assert.equal((await login(email, 'sai-' + i + '-xyzabc')).status, 401, `lần sai ${i}`);
  assert.equal((await login(email, 'sai-5-xyzabc')).status, 423, 'lần sai thứ 5 khóa tài khoản');
  assert.equal((await login(email, TEMP)).status, 423, 'mật khẩu đúng vẫn bị khóa trong thời gian khóa');
  const locked = accountOf(email);
  assert.ok(locked.locked_until > new Date().toISOString(), 'locked_until phải ở tương lai');
  sql.prepare('UPDATE accounts SET locked_until = ? WHERE email = ?').run('2000-01-01T00:00:00.000Z', email);
  assert.equal((await login(email, TEMP)).status, 200, 'sau khi hết hạn khóa thì đăng nhập được');
  assert.equal(accountOf(email).failed_attempts, 0, 'bộ đếm sai được đặt lại sau đăng nhập thành công');
}

// 4) Cookie phiên: HttpOnly, Secure, SameSite=Lax, Path=/; token không được lưu thô ở bất kỳ bảng nào.
{
  const res = await login(OWNER_EMAIL, TEST_ADMIN_PASSWORD);
  assert.equal(res.status, 200);
  const setCookie = res.headers.get('set-cookie');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=43200']) {
    assert.ok(setCookie.includes(flag), `cookie thiếu ${flag}`);
  }
  const token = setCookie.split(';')[0].split('=').slice(1).join('=');
  assert.ok(token.length >= 40, 'token phiên đủ dài');
  for (const { name } of sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
    const dump = JSON.stringify(sql.prepare(`SELECT * FROM ${name}`).all());
    assert.equal(dump.includes(token), false, `token thô không được lưu trong bảng ${name}`);
  }
  const hashes = sql.prepare('SELECT token_hash FROM sessions').all().map((r) => r.token_hash);
  assert.ok(hashes.every((h) => /^[0-9a-f]{64}$/.test(h)), 'sessions chỉ lưu băm SHA-256');
  for (const secret of SECRET_CHECK) {
    const dump = JSON.stringify(sql.prepare('SELECT * FROM accounts').all());
    assert.equal(dump.includes(secret), false, 'mật khẩu thô không được lưu trong accounts');
  }
}

// 5) Phiên hết hạn: không còn quyền tình nguyện viên, dù cookie vẫn gửi lên.
{
  const cookie = await activeVolunteer('het-han@test.test');
  assert.equal((await (await GET('me', { cookie })).json()).volunteer, true);
  sql.prepare('UPDATE sessions SET expires_at = ? WHERE account_id = ?').run('2000-01-01T00:00:00.000Z', accountOf('het-han@test.test').id);
  const after = await (await GET('me', { cookie })).json();
  assert.equal(after.volunteer, false, 'phiên hết hạn không còn quyền');
  assert.equal(after.account, null);
}

// 6) Vô hiệu hóa: phiên hiện có mất hiệu lực, đăng nhập trả 403; kích hoạt lại thì đăng nhập được.
{
  const email = 'vo-hieu@test.test';
  const cookie = await activeVolunteer(email);
  const id = accountOf(email).id;
  assert.equal((await POST('accounts/status', { cookie: await admin(), json: { id, active: false } })).status, 200);
  assert.equal((await (await GET('me', { cookie })).json()).volunteer, false, 'phiên cũ mất hiệu lực');
  assert.equal(countSessions(id), 0, 'vô hiệu hóa xóa mọi phiên của tài khoản');
  assert.equal((await login(email, NEW_PW)).status, 403, 'tài khoản bị vô hiệu hóa không đăng nhập được');
  assert.equal((await POST('accounts/status', { cookie: await admin(), json: { id, active: true } })).status, 200);
  assert.equal((await login(email, NEW_PW)).status, 200, 'kích hoạt lại thì đăng nhập được');
}

// 7) Đặt lại mật khẩu: xóa mọi phiên, buộc đổi mật khẩu; khi còn buộc đổi thì không được ghi phiếu.
{
  const email = 'dat-lai@test.test';
  const cookie = await activeVolunteer(email);
  const id = accountOf(email).id;
  assert.equal((await POST('assessment', { cookie, json: assessmentBody('auth-dat-lai-1') })).status, 200, 'trước khi đặt lại: ghi phiếu được');
  assert.equal((await POST('accounts/reset', { cookie: await admin(), json: { id, password: TEMP } })).status, 200);
  assert.equal((await (await GET('me', { cookie })).json()).volunteer, false, 'phiên cũ bị xóa sau khi đặt lại');
  const temp = await loginCookie(api, email, TEMP);
  assert.equal((await (await GET('me', { cookie: temp })).json()).account.mustChange, true, 'phải đổi mật khẩu sau khi đặt lại');
  assert.equal((await POST('assessment', { cookie: temp, json: assessmentBody('auth-dat-lai-2') })).status, 403, 'đang buộc đổi mật khẩu thì không ghi phiếu');
}

// 8) Đổi mật khẩu của chính mình: sai mật khẩu hiện tại bị từ chối; đúng thì xóa phiên khác, giữ phiên hiện tại.
{
  const email = 'doi-mat-khau@test.test';
  const current = await activeVolunteer(email);
  const other = await loginCookie(api, email, NEW_PW);
  assert.equal((await POST('auth/password', { cookie: current, json: { current: 'khong-dung-mat-khau', next: 'mat-khau-tiep-1234' } })).status, 400);
  assert.equal((await POST('auth/password', { cookie: current, json: { current: NEW_PW, next: 'mat-khau-tiep-1234' } })).status, 200);
  assert.equal((await (await GET('me', { cookie: current })).json()).volunteer, true, 'phiên hiện tại vẫn còn');
  assert.equal((await (await GET('me', { cookie: other })).json()).volunteer, false, 'phiên khác bị xóa');
  assert.equal((await login(email, NEW_PW)).status, 401, 'mật khẩu cũ không còn dùng được');
  assert.equal((await login(email, 'mat-khau-tiep-1234')).status, 200);
}

// 9) Tự cập nhật thông tin cá nhân; tên quá dài bị từ chối.
{
  const cookie = await activeVolunteer('ho-ten@test.test');
  assert.equal((await POST('auth/profile', { cookie, json: { full_name: 'Nguyễn Văn An' } })).status, 200);
  assert.equal((await (await GET('me', { cookie })).json()).account.fullName, 'Nguyễn Văn An');
  assert.equal((await POST('auth/profile', { cookie, json: { full_name: 'x'.repeat(101) } })).status, 400);
}

// 10) Phân quyền: tình nguyện viên không quản lý tài khoản; khách không có phiên bị 401.
{
  const cookie = await activeVolunteer('phan-quyen@test.test');
  assert.equal((await GET('accounts', { cookie })).status, 403);
  assert.equal((await POST('accounts', { cookie, json: { email: 'x@test.test', password: TEMP } })).status, 403);
  assert.equal((await POST('accounts/reset', { cookie, json: { id: 'x', password: TEMP } })).status, 403);
  assert.equal((await POST('accounts', { json: { email: 'x@test.test', password: TEMP } })).status, 401);
}

// 11) Header danh tính nền tảng không còn cấp quyền quản trị (CLAUDE.md mục 2).
{
  const res = await GET('dashboard', { headers: { 'oai-authenticated-user-id': 'x', 'oai-authenticated-user-email': OWNER_EMAIL } });
  assert.equal(res.status, 403, 'email chủ website trong header không đủ để vào dashboard');
}

// 12) Email chủ website không được cấp làm tài khoản tình nguyện viên.
{
  const res = await POST('accounts', { cookie: await admin(), json: { email: OWNER_EMAIL, password: TEMP } });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'Email này không dùng cho tài khoản tình nguyện viên');
}

// 13) Me không lộ email chủ website; đăng xuất xóa phiên và cookie.
{
  const cookie = await admin();
  const me = await (await GET('me', { cookie })).json();
  assert.equal(me.admin, true);
  assert.equal(me.account.email, '', 'không trả email chủ website');
  const out = await POST('auth/logout', { cookie });
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await (await GET('me', { cookie })).json()).admin, false, 'phiên đã đăng xuất không còn quyền');
}

// 14) Quản trị viên: mật khẩu ban đầu lấy từ ADMIN_PASSWORD một lần; sau đó biến môi trường không còn tác dụng.
{
  const sql2 = new DatabaseSync(':memory:');
  sql2.exec('PRAGMA foreign_keys = ON');
  applyMigrations(sql2);
  const first = await loadApi(sql2, { adminPassword: 'mat-khau-ban-dau-1' });
  const attempt = (password) => first.POST(req('POST', 'auth/login', { json: { email: OWNER_EMAIL, password } }));
  assert.equal((await attempt('mat-khau-sai-1234')).status, 401, 'mật khẩu env sai không tạo tài khoản quản trị');
  assert.equal(sql2.prepare("SELECT COUNT(*) AS n FROM accounts WHERE id='owner'").get().n, 0);
  assert.equal((await attempt('mat-khau-ban-dau-1')).status, 200, 'lần đầu đúng: tạo tài khoản quản trị');
  const later = await loadApi(sql2, { adminPassword: 'mat-khau-env-doi-1' });
  const laterLogin = (password) => later.POST(req('POST', 'auth/login', { json: { email: OWNER_EMAIL, password } }));
  assert.equal((await laterLogin('mat-khau-env-doi-1')).status, 401, 'đổi biến môi trường không thay mật khẩu đã lưu');
  assert.equal((await laterLogin('mat-khau-ban-dau-1')).status, 200, 'mật khẩu đã lưu vẫn dùng được');
}

// 15) Quy tắc đầu vào và băm mật khẩu (đơn vị): ranh giới độ dài, định dạng lưu, chuỗi hỏng không xác thực được.
{
  const rules = await loadShared('auth-rules');
  assert.equal(rules.validateNewPassword('a'.repeat(9)).ok, false);
  assert.equal(rules.validateNewPassword('a'.repeat(10)).ok, true);
  assert.equal(rules.validateNewPassword('a'.repeat(200)).ok, true);
  assert.equal(rules.validateNewPassword('a'.repeat(201)).ok, false);
  assert.equal(rules.validateLogin({ email: 'a@b.test', password: '' }).ok, false);
  assert.equal(rules.addMinutes('2026-10-29T10:00:00.000Z', 15), '2026-10-29T10:15:00.000Z');
  const hash = await loadShared('password-hash');
  const stored = await hash.hashPassword('mat-khau-don-1234');
  assert.match(stored, /^pbkdf2-sha256\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(await hash.verifyPassword('mat-khau-don-1234', stored), true);
  assert.equal(await hash.verifyPassword('mat-khau-don-1235', stored), false);
  assert.equal(await hash.verifyPassword('mat-khau-don-1234', 'khong-dung-dinh-dang'), false);
  assert.equal(await hash.verifyPassword('mat-khau-don-1234', stored.replace('pbkdf2-sha256', 'md5')), false);
  assert.notEqual(stored, await hash.hashPassword('mat-khau-don-1234'), 'mỗi lần băm có muối riêng');
}

console.log('PASS: xác thực: chính sách mật khẩu, thông báo lỗi đồng nhất, khóa tạm 5 lần/15 phút, cookie HttpOnly/Secure/SameSite, token chỉ lưu băm, phiên hết hạn, vô hiệu hóa, đặt lại buộc đổi mật khẩu, đổi mật khẩu và hồ sơ, phân quyền tài khoản, header không cấp quyền, email chủ website được bảo vệ, bootstrap quản trị từ biến môi trường, băm PBKDF2');
