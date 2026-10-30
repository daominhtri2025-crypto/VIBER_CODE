import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { applyMigrations } from './migrate-helper.mjs';
import { loadApi, TEST_RESEND_KEY } from './route-harness.mjs';
import { ORIGIN, OWNER_EMAIL, loginCookie, ownerCookie, volunteerCookie } from './auth-helper.mjs';

// Kiểm thử khôi phục mật khẩu qua email (SRS FR-AUTH-11; CLAUDE.md mục 2C, 4.13, 4.14, 7).
// Chạy route.ts thật trên SQLite thật. Email được gửi qua fetch giả đếm số lần gọi; không gọi Resend thật.

const RESEND_URL = 'https://api.resend.com/emails';
const FORGOT_MESSAGE = 'Nếu email này có trong hệ thống, liên kết đặt lại mật khẩu sẽ được gửi trong ít phút. Hãy kiểm tra cả hộp thư rác.';
const INVALID_LINK = 'Liên kết đặt lại không hợp lệ hoặc đã hết hạn';
const TEMP = 'mat-khau-tam-10';
const NEW_PW = 'mat-khau-reset-moi-1';

// Fetch giả: ghi lại mọi lệnh gọi tới Resend và từ chối mọi địa chỉ khác để kiểm thử không chạm mạng thật.
const sent = [];
let failNextSend = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url) !== RESEND_URL) throw new Error('Kiểm thử không được gọi mạng thật');
  sent.push({ authorization: init.headers.Authorization, body: JSON.parse(init.body) });
  if (failNextSend) {
    failNextSend = false;
    return new Response('{"message":"giả lập lỗi"}', { status: 500 });
  }
  return new Response('{"id":"gia-lap"}', { status: 200 });
};

const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
applyMigrations(sql);
const api = await loadApi(sql);

// Mỗi yêu cầu mặc định dùng một IP riêng để giới hạn theo IP (10 mỗi giờ) không ảnh hưởng các kiểm thử khác.
let ipCounter = 0;
const nextIp = () => `192.0.2.${(ipCounter += 1)}`;
const post = (path, json, { cookie, withOrigin = true, ip } = {}) => api.POST(new Request(`${ORIGIN}/api/${path}`, {
  method: 'POST',
  headers: {
    ...(withOrigin ? { origin: ORIGIN } : {}),
    'Content-Type': 'application/json',
    ...(cookie ? { cookie } : {}),
    'cf-connecting-ip': ip ?? nextIp(),
  },
  body: JSON.stringify(json),
}));
const get = (path, cookie) => api.GET(new Request(`${ORIGIN}/api/${path}`, { headers: cookie ? { cookie } : {} }));
const forgot = (email, ip) => post('auth/forgot', { email }, { ip });
const reset = (token, password) => post('auth/reset', { token, password });
const accountIdOf = (email) => sql.prepare('SELECT id FROM accounts WHERE email = ?').get(email).id;
const tokenRows = (accountId) => sql.prepare('SELECT * FROM password_reset_tokens WHERE account_id = ? ORDER BY created').all(accountId);
const lastEmailToken = () => {
  const text = sent.at(-1).body.text;
  const match = /#dat-lai=([A-Za-z0-9_-]+)/.exec(text);
  assert.ok(match, 'email phải chứa liên kết có token');
  return match[1];
};

// Tạo tình nguyện viên đã kích hoạt; mật khẩu sau đổi là TEMP + "-moi" theo auth-helper.
const ACTIVE_PW = TEMP + '-moi';
const adminCookie = await ownerCookie(api);
assert.ok(adminCookie, 'chủ website đăng nhập được để chuẩn bị dữ liệu');

// 1) Email không tồn tại: phản hồi chung, không gửi email.
{
  sent.length = 0;
  const res = await forgot('khong-co-ai@test.test');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).message, FORGOT_MESSAGE);
  assert.equal(sent.length, 0, 'email không tồn tại không được gửi thư');
}

// 2) Email có tồn tại: cùng phản hồi, gửi đúng một thư tới địa chỉ đó, token 43 ký tự trong liên kết.
// Phiên này được lấy trước khi đặt lại; sau đặt lại phải không còn hiệu lực (bước 6).
let oldSession = null;
{
  oldSession = await volunteerCookie(api, 'tnv-khoi-phuc@test.test', TEMP);
  assert.ok(oldSession, 'phiên trước khi đặt lại tồn tại');
  sent.length = 0;
  const res = await forgot('tnv-khoi-phuc@test.test');
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.message, FORGOT_MESSAGE, 'phản hồi giống hệt trường hợp email không tồn tại');
  assert.equal(sent.length, 1, 'đúng một thư được gửi');
  assert.equal(sent[0].body.to[0], 'tnv-khoi-phuc@test.test');
  assert.equal(sent[0].authorization, `Bearer ${TEST_RESEND_KEY}`, 'khóa đọc từ cấu hình, không ghi trong thân yêu cầu');
  assert.equal(lastEmailToken().length, 43);
  assert.ok(sent[0].body.text.includes(`${ORIGIN}/admin#dat-lai=`), 'liên kết dùng APP_BASE_URL');
  assert.ok(!JSON.stringify(body).includes(lastEmailToken()), 'token không xuất hiện trong phản hồi');
}

// 3) Cơ sở dữ liệu chỉ chứa băm, không chứa token dạng rõ hay khóa Resend.
{
  const token = lastEmailToken();
  const dump = [];
  for (const { name } of sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
    dump.push(JSON.stringify(sql.prepare(`SELECT * FROM ${name}`).all()));
  }
  const everything = dump.join('\n');
  assert.ok(!everything.includes(token), 'token dạng rõ không được lưu trong cơ sở dữ liệu');
  assert.ok(!everything.includes(TEST_RESEND_KEY), 'khóa Resend không được lưu trong cơ sở dữ liệu');
  const row = tokenRows(accountIdOf('tnv-khoi-phuc@test.test'))[0];
  assert.equal(row.token_hash.length, 64, 'chỉ lưu băm SHA-256 (64 ký tự hex)');
}

// 4) Thời hạn 15 phút: expires_at đúng bằng created + 15 phút.
{
  const row = tokenRows(accountIdOf('tnv-khoi-phuc@test.test'))[0];
  assert.equal(Date.parse(row.expires_at) - Date.parse(row.created), 15 * 60_000, 'liên kết hiệu lực đúng 15 phút');
}

// 5) Token sai định dạng và mật khẩu ngắn bị từ chối; lỗi nhập mật khẩu không làm mất token.
{
  const token = lastEmailToken();
  assert.equal((await reset('khong-hop-le', NEW_PW)).status, 400);
  const short = await reset(token, 'ngan-qua');
  assert.equal(short.status, 400, 'mật khẩu dưới 10 ký tự bị từ chối');
  assert.equal((await reset(token, 'a'.repeat(201))).status, 400, 'mật khẩu quá 200 ký tự bị từ chối');
  const usable = await reset(token, NEW_PW);
  assert.equal(usable.status, 200, 'token vẫn dùng được sau lỗi nhập mật khẩu');
}

// 6) Đặt lại thành công: mật khẩu mới đăng nhập được, mật khẩu cũ không, phiên cũ bị đăng xuất.
{
  // Đã đặt lại ở bước 5; mật khẩu cũ không còn dùng được và phiên lấy trước đó bị đăng xuất.
  assert.equal(await loginCookie(api, 'tnv-khoi-phuc@test.test', ACTIVE_PW), null, 'mật khẩu cũ không còn dùng được');
  assert.ok(await loginCookie(api, 'tnv-khoi-phuc@test.test', NEW_PW), 'mật khẩu mới đăng nhập được');
  const me = await (await get('me', oldSession)).json();
  assert.equal(me.account, null, 'phiên trước khi đặt lại không còn hiệu lực');
}

// 7) Token dùng một lần: dùng lại bị từ chối.
{
  sent.length = 0;
  await forgot('tnv-khoi-phuc@test.test');
  const token = lastEmailToken();
  assert.equal((await reset(token, 'mat-khau-lan-hai-1')).status, 200);
  const again = await reset(token, 'mat-khau-lan-ba-1');
  assert.equal(again.status, 400, 'token đã dùng không được dùng lại');
  assert.equal((await again.json()).error, INVALID_LINK);
}

// 8) Token hết hạn (quá 15 phút) bị từ chối.
{
  const accountId = accountIdOf('tnv-khoi-phuc@test.test');
  sent.length = 0;
  await forgot('tnv-khoi-phuc@test.test');
  const token = lastEmailToken();
  sql.prepare("UPDATE password_reset_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE account_id = ? AND used_at IS NULL").run(accountId);
  assert.equal((await reset(token, 'mat-khau-het-han-1')).status, 400, 'token quá hạn bị từ chối');
}

// 9) Yêu cầu mới làm vô hiệu hóa token cũ; chỉ token mới dùng được.
{
  await volunteerCookie(api, 'tnv-vo-hieu@test.test', TEMP);
  sent.length = 0;
  await forgot('tnv-vo-hieu@test.test');
  const first = lastEmailToken();
  await forgot('tnv-vo-hieu@test.test');
  const second = lastEmailToken();
  assert.notEqual(first, second);
  assert.equal((await reset(first, NEW_PW)).status, 400, 'token cũ đã bị vô hiệu hóa');
  assert.equal((await reset(second, NEW_PW)).status, 200, 'token mới dùng được');
}

// 10) Giới hạn 3 yêu cầu mỗi tài khoản mỗi giờ: yêu cầu thứ tư không gửi thư, phản hồi vẫn giống hệt.
{
  await volunteerCookie(api, 'tnv-gioi-han@test.test', TEMP);
  sent.length = 0;
  const bodies = [];
  for (let i = 0; i < 4; i += 1) {
    const res = await forgot('tnv-gioi-han@test.test');
    assert.equal(res.status, 200);
    bodies.push((await res.json()).message);
  }
  assert.equal(sent.length, 3, 'chỉ ba thư được gửi trong một giờ');
  assert.ok(bodies.every((message) => message === FORGOT_MESSAGE), 'yêu cầu vượt giới hạn có phản hồi giống hệt');
}

// 11) Tài khoản bị vô hiệu hóa: không gửi thư, phản hồi giống hệt.
{
  await volunteerCookie(api, 'tnv-vo-hieu-hoa@test.test', TEMP);
  const id = accountIdOf('tnv-vo-hieu-hoa@test.test');
  const off = await post('accounts/status', { id, active: false }, { cookie: adminCookie });
  assert.equal(off.status, 200);
  sent.length = 0;
  const res = await forgot('tnv-vo-hieu-hoa@test.test');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).message, FORGOT_MESSAGE);
  assert.equal(sent.length, 0, 'tài khoản bị vô hiệu hóa không nhận thư đặt lại');
}

// 12) Gửi thư lỗi: phản hồi vẫn giống hệt, không lộ việc gửi thất bại.
{
  await volunteerCookie(api, 'tnv-loi-gui@test.test', TEMP);
  sent.length = 0;
  failNextSend = true;
  const res = await forgot('tnv-loi-gui@test.test');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).message, FORGOT_MESSAGE);
  assert.equal(sent.length, 1, 'lần gửi đã được thử');
}

// 13) Kiểm tra Origin và định dạng đầu vào.
{
  assert.equal((await post('auth/forgot', { email: 'a@test.test' }, { withOrigin: false })).status, 403, 'thiếu Origin bị từ chối');
  assert.equal((await post('auth/reset', { token: 'x', password: NEW_PW }, { withOrigin: false })).status, 403);
  assert.equal((await forgot('khong-phai-email')).status, 400, 'email sai định dạng bị từ chối');
}

// 14) Thiếu cấu hình gửi email: trả 503 có thông báo chung, không lộ tài khoản.
{
  const noMailSql = new DatabaseSync(':memory:');
  noMailSql.exec('PRAGMA foreign_keys = ON');
  applyMigrations(noMailSql);
  const noMailApi = await loadApi(noMailSql, { resendApiKey: '' });
  const res = await noMailApi.POST(new Request(`${ORIGIN}/api/auth/forgot`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bat-ky@test.test' }),
  }));
  assert.equal(res.status, 503);
}

// 16) Giới hạn theo IP: mười yêu cầu mỗi giờ từ một IP; yêu cầu thứ mười một bị 429 và không gửi thư; IP khác không bị ảnh hưởng.
{
  await volunteerCookie(api, 'ip-gioi-han@test.test', TEMP);
  const attackerIp = '198.51.100.7';
  sent.length = 0;
  for (let i = 0; i < 10; i += 1) {
    const res = await forgot(`ip-khac-${i}@test.test`, attackerIp);
    assert.equal(res.status, 200, `yêu cầu thứ ${i + 1} trong hạn mức`);
  }
  const eleventh = await forgot('ip-gioi-han@test.test', attackerIp);
  assert.equal(eleventh.status, 429, 'yêu cầu thứ mười một từ cùng IP bị giới hạn');
  assert.equal(sent.length, 0, 'yêu cầu bị giới hạn không gửi thư, kể cả tới tài khoản có thật');
  const other = await forgot('ip-gioi-han@test.test', '203.0.113.9');
  assert.equal(other.status, 200, 'IP khác không bị giới hạn');
  assert.equal(sent.length, 1);
  // Khóa lưu băm của IP, không lưu IP thô.
  const limits = JSON.stringify(sql.prepare('SELECT * FROM request_limits').all());
  assert.ok(!limits.includes(attackerIp), 'IP thô không được lưu trong request_limits');
  assert.ok(!limits.includes('203.0.113.9'), 'IP thô không được lưu trong request_limits');
}

// 15) Chủ website: liên kết gửi tới địa chỉ cấu hình OWNER_EMAIL, không tới 'chu-website'.
// Đặt cuối cùng vì khối này đổi mật khẩu chủ website; các khối trước cần đăng nhập bằng mật khẩu gốc.
{
  sent.length = 0;
  const res = await forgot(OWNER_EMAIL);
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.to[0], OWNER_EMAIL);
  const token = lastEmailToken();
  assert.equal((await reset(token, NEW_PW)).status, 200);
  assert.ok(await loginCookie(api, OWNER_EMAIL, NEW_PW), 'chủ website đăng nhập bằng mật khẩu mới');
}

globalThis.fetch = realFetch;
console.log('PASS: khôi phục mật khẩu qua email (15 phút, dùng một lần, token băm, giới hạn yêu cầu, phản hồi chung, đăng xuất phiên, Origin, cấu hình)');
