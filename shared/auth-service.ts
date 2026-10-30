// Dịch vụ xác thực quản trị viên và tình nguyện viên (SRS FR-AUTH; CLAUDE.md mục 2, 3, 4).
// Học viên vẫn dùng danh tính nền tảng qua header; dịch vụ này chỉ phục vụ hai vai trò có mật khẩu.
// Không nhận yêu cầu HTTP: route đọc cookie, gọi hàm ở đây và tự đặt Set-Cookie.
import { LOCK_MINUTES, LOCK_THRESHOLD, SESSION_HOURS, addHours, addMinutes } from './auth-rules';
import { constantTimeEqualText, hashPassword, verifyPassword } from './password-hash';
import { isStaffEmail } from './identity-service';

// Giao diện tối thiểu khớp prepare/bind/first/all/run của D1 và của adapter kiểm thử.
export interface AuthStatement {
  bind(...values: unknown[]): AuthStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface AuthDb {
  prepare(query: string): AuthStatement;
}

// Tài khoản quản trị có id cố định. Email thật của chủ website không được lưu trong DB (CLAUDE.md mục 2, 8).
export const OWNER_ACCOUNT_ID = 'owner';
export const OWNER_ACCOUNT_EMAIL = 'chu-website';

export interface AuthConfig {
  ownerEmail?: string;
  adminPassword?: string;
}

export type Role = 'admin' | 'volunteer';

// Phiên đã xác thực. canAssess: được ghi phiếu quan sát (tình nguyện viên có trong staff, không bị buộc đổi mật khẩu).
export interface Session {
  accountId: string;
  role: Role;
  email: string;
  fullName: string | null;
  mustChange: boolean;
  canAssess: boolean;
  assessorLabel: string;
}

export type LoginOutcome =
  | { kind: 'ok'; token: string; role: Role; mustChange: boolean }
  | { kind: 'invalid' }
  | { kind: 'locked' }
  | { kind: 'disabled' }
  | { kind: 'unavailable' };

type AccountRow = {
  id: string;
  email: string;
  full_name: string | null;
  password_hash: string;
  active: number;
  must_change: number;
  failed_attempts: number;
  locked_until: string | null;
};

const ACCOUNT_COLUMNS = 'id, email, full_name, password_hash, active, must_change, failed_attempts, locked_until';
const encoder = new TextEncoder();

// Xuất để dịch vụ khôi phục mật khẩu dùng chung cách băm token (CLAUDE.md mục 2C.2).
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Token phiên 256 bit; DB chỉ lưu băm SHA-256 của token, không lưu token thô.
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Băm giả để đăng nhập với email không tồn tại tốn thời gian như trường hợp có tài khoản (tránh dò email).
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('mat-khau-gia-khong-dung-duoc');
  return dummyHash;
}

async function findAccount(db: AuthDb, id: string): Promise<AccountRow | null> {
  return db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id=?`).bind(id).first<AccountRow>();
}

async function isStaff(db: AuthDb, email: string): Promise<boolean> {
  return isStaffEmail(db, email);
}

async function createSession(db: AuthDb, accountId: string, role: Role, now: string): Promise<string> {
  const token = newToken();
  await db
    .prepare('INSERT INTO sessions(token_hash,account_id,role,expires_at,created) VALUES(?,?,?,?,?)')
    .bind(await sha256Hex(token), accountId, role, addHours(now, SESSION_HOURS), now)
    .run();
  return token;
}

// Ghi nhận một lần sai. Đạt ngưỡng thì khóa tạm và đặt lại bộ đếm, để lần sau tính từ đầu.
async function recordFailure(db: AuthDb, row: AccountRow, now: string): Promise<boolean> {
  const failed = row.failed_attempts + 1;
  const lockedUntil = failed >= LOCK_THRESHOLD ? addMinutes(now, LOCK_MINUTES) : null;
  await db
    .prepare('UPDATE accounts SET failed_attempts=?, locked_until=?, updated=? WHERE id=?')
    .bind(lockedUntil ? 0 : failed, lockedUntil, now, row.id)
    .run();
  return lockedUntil !== null;
}

async function finishLogin(db: AuthDb, row: AccountRow, password: string, role: Role, now: string): Promise<LoginOutcome> {
  if (row.locked_until !== null && row.locked_until > now) return { kind: 'locked' };
  if (!(await verifyPassword(password, row.password_hash))) {
    const locked = await recordFailure(db, row, now);
    return locked ? { kind: 'locked' } : { kind: 'invalid' };
  }
  if (row.active !== 1) return { kind: 'disabled' };
  if (role === 'volunteer' && !(await isStaff(db, row.email))) return { kind: 'invalid' };
  await db.prepare('UPDATE accounts SET failed_attempts=0, locked_until=NULL, updated=? WHERE id=?').bind(now, row.id).run();
  const token = await createSession(db, row.id, role, now);
  return { kind: 'ok', token, role, mustChange: row.must_change === 1 };
}

// Quản trị viên: email trùng cấu hình chủ website. Lần đăng nhập đầu tiên lấy mật khẩu từ ADMIN_PASSWORD
// rồi lưu băm; từ đó mật khẩu đổi trong ứng dụng, biến môi trường không còn tác dụng.
async function ownerLogin(db: AuthDb, password: string, adminPassword: string | undefined, now: string): Promise<LoginOutcome> {
  let row = await findAccount(db, OWNER_ACCOUNT_ID);
  if (!row) {
    if (!adminPassword) return { kind: 'unavailable' };
    if (!constantTimeEqualText(password, adminPassword)) return { kind: 'invalid' };
    await db
      .prepare('INSERT OR IGNORE INTO accounts(id,email,full_name,password_hash,active,must_change,failed_attempts,locked_until,created,updated) VALUES(?,?,NULL,?,1,0,0,NULL,?,?)')
      .bind(OWNER_ACCOUNT_ID, OWNER_ACCOUNT_EMAIL, await hashPassword(password), now, now)
      .run();
    row = await findAccount(db, OWNER_ACCOUNT_ID);
    if (!row) return { kind: 'unavailable' };
  }
  return finishLogin(db, row, password, 'admin', now);
}

async function volunteerLogin(db: AuthDb, email: string, password: string, now: string): Promise<LoginOutcome> {
  const row = await db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE email=? AND id<>?`)
    .bind(email, OWNER_ACCOUNT_ID)
    .first<AccountRow>();
  if (!row) {
    await verifyPassword(password, await getDummyHash());
    return { kind: 'invalid' };
  }
  return finishLogin(db, row, password, 'volunteer', now);
}

export async function login(
  db: AuthDb,
  input: { email: string; password: string },
  config: AuthConfig,
  now: string,
): Promise<LoginOutcome> {
  const owner = config.ownerEmail?.trim().toLowerCase();
  if (owner && input.email === owner) return ownerLogin(db, input.password, config.adminPassword, now);
  return volunteerLogin(db, input.email, input.password, now);
}

// Xác định phiên từ token cookie. Trả null khi không có, đã hết hạn, hoặc tài khoản bị vô hiệu hóa.
export async function resolveSession(db: AuthDb, token: string | null, now: string): Promise<Session | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      'SELECT s.account_id, s.role, s.expires_at, a.email, a.full_name, a.active, a.must_change FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=?',
    )
    .bind(await sha256Hex(token))
    .first<{ account_id: string; role: Role; expires_at: string; email: string; full_name: string | null; active: number; must_change: number }>();
  if (!row || row.expires_at <= now || row.active !== 1) return null;
  const mustChange = row.must_change === 1;
  if (row.role === 'admin') {
    return {
      accountId: row.account_id,
      role: 'admin',
      email: '',
      fullName: row.full_name,
      mustChange,
      canAssess: !mustChange,
      assessorLabel: OWNER_ACCOUNT_EMAIL,
    };
  }
  const staff = await isStaff(db, row.email);
  return {
    accountId: row.account_id,
    role: 'volunteer',
    email: row.email,
    fullName: row.full_name,
    mustChange,
    canAssess: !mustChange && staff,
    assessorLabel: row.email,
  };
}

export async function logout(db: AuthDb, token: string | null): Promise<void> {
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256Hex(token)).run();
}

// Đổi mật khẩu của chính mình: cần mật khẩu hiện tại; xóa phiên khác, giữ phiên đang dùng.
export async function changePassword(
  db: AuthDb,
  session: Session,
  currentToken: string,
  input: { current: string; next: string },
  now: string,
): Promise<'ok' | 'wrong_current' | 'unavailable'> {
  const row = await findAccount(db, session.accountId);
  if (!row) return 'unavailable';
  if (!(await verifyPassword(input.current, row.password_hash))) return 'wrong_current';
  await db
    .prepare('UPDATE accounts SET password_hash=?, must_change=0, failed_attempts=0, locked_until=NULL, updated=? WHERE id=?')
    .bind(await hashPassword(input.next), now, session.accountId)
    .run();
  await db
    .prepare('DELETE FROM sessions WHERE account_id=? AND token_hash<>?')
    .bind(session.accountId, await sha256Hex(currentToken))
    .run();
  return 'ok';
}

export async function updateProfile(db: AuthDb, accountId: string, fullName: string | null, now: string): Promise<void> {
  await db.prepare('UPDATE accounts SET full_name=?, updated=? WHERE id=?').bind(fullName, now, accountId).run();
}

// Tạo tài khoản tình nguyện viên với mật khẩu tạm: buộc đổi ở lần đăng nhập đầu. Đồng thời cấp quyền trong bảng staff.
export async function createAccount(
  db: AuthDb,
  input: { email: string; password: string; fullName: string | null },
  config: AuthConfig,
  newId: string,
  now: string,
): Promise<'created' | 'exists' | 'reserved'> {
  if (config.ownerEmail && input.email === config.ownerEmail.trim().toLowerCase()) return 'reserved';
  const existing = await db.prepare('SELECT id FROM accounts WHERE email=?').bind(input.email).first();
  if (existing) return 'exists';
  await db
    .prepare('INSERT INTO accounts(id,email,full_name,password_hash,active,must_change,failed_attempts,locked_until,created,updated) VALUES(?,?,?,?,1,1,0,NULL,?,?)')
    .bind(newId, input.email, input.fullName, await hashPassword(input.password), now, now)
    .run();
  await db.prepare('INSERT OR IGNORE INTO staff(email,created) VALUES(?,?)').bind(input.email, now).run();
  return 'created';
}

// Quản trị viên đặt lại mật khẩu tạm: buộc đổi lại, mở khóa, và đăng xuất mọi phiên của tài khoản.
export async function resetPassword(db: AuthDb, id: string, password: string, now: string): Promise<'ok' | 'not_found'> {
  if (id === OWNER_ACCOUNT_ID || !(await findAccount(db, id))) return 'not_found';
  await db
    .prepare('UPDATE accounts SET password_hash=?, must_change=1, failed_attempts=0, locked_until=NULL, updated=? WHERE id=?')
    .bind(await hashPassword(password), now, id)
    .run();
  await db.prepare('DELETE FROM sessions WHERE account_id=?').bind(id).run();
  return 'ok';
}

// Vô hiệu hóa hoặc kích hoạt lại. Vô hiệu hóa thì xóa phiên hiện có.
export async function setAccountActive(db: AuthDb, id: string, active: boolean, now: string): Promise<'ok' | 'not_found'> {
  if (id === OWNER_ACCOUNT_ID || !(await findAccount(db, id))) return 'not_found';
  await db.prepare('UPDATE accounts SET active=?, updated=? WHERE id=?').bind(active ? 1 : 0, now, id).run();
  if (!active) await db.prepare('DELETE FROM sessions WHERE account_id=?').bind(id).run();
  return 'ok';
}

export async function listAccounts(db: AuthDb): Promise<Record<string, unknown>[]> {
  const { results } = await db
    .prepare('SELECT id, email, full_name, active, must_change, locked_until, created FROM accounts WHERE id<>? ORDER BY email')
    .bind(OWNER_ACCOUNT_ID)
    .all<Record<string, unknown>>();
  return results;
}
