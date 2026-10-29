// Trợ giúp kiểm thử xác thực: lấy cookie phiên bằng POST /api/auth/login thật (CLAUDE.md mục 7: không giả lập phiên).
import { TEST_ADMIN_PASSWORD } from './route-harness.mjs';

export const ORIGIN = 'https://site.test';
export const OWNER_EMAIL = 'owner@example.test';
export const OWNER_PASSWORD = TEST_ADMIN_PASSWORD;

// Trả về cặp "tên=giá trị" của cookie phiên, hoặc null nếu đăng nhập thất bại.
export async function loginCookie(api, email, password) {
  const res = await api.POST(new Request(`${ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }));
  if (res.status !== 200) return null;
  return res.headers.get('set-cookie').split(';')[0];
}

export const ownerCookie = (api) => loginCookie(api, OWNER_EMAIL, OWNER_PASSWORD);

// Chủ website tạo tài khoản tình nguyện viên qua API thật, rồi đăng nhập bằng mật khẩu tạm và đổi sang mật khẩu mới.
export async function volunteerCookie(api, email, password = 'mat-khau-tinh-nguyen-1') {
  const admin = await ownerCookie(api);
  const created = await api.POST(new Request(`${ORIGIN}/api/accounts`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'Content-Type': 'application/json', cookie: admin },
    body: JSON.stringify({ email, password }),
  }));
  if (created.status !== 201) throw new Error(`tạo tài khoản thất bại: ${created.status}`);
  const first = await loginCookie(api, email, password);
  const changed = await api.POST(new Request(`${ORIGIN}/api/auth/password`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'Content-Type': 'application/json', cookie: first },
    body: JSON.stringify({ current: password, next: password + '-moi' }),
  }));
  if (changed.status !== 200) throw new Error(`đổi mật khẩu thất bại: ${changed.status}`);
  return loginCookie(api, email, password + '-moi');
}
