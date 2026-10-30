// Dịch vụ khôi phục mật khẩu qua email (SRS FR-AUTH-11; CLAUDE.md mục 2C.8, 4.14).
// Route kiểm tra Origin, đầu vào và đặt phản hồi chung; hàm ở đây chỉ xử lý nghiệp vụ và dữ liệu.
// Không ghi token, email đích hay khóa vào nhật ký.
import { addMinutes, type Validated } from './auth-rules';
import { hashPassword } from './password-hash';
import { OWNER_ACCOUNT_ID, newToken, sha256Hex, type AuthDb } from './auth-service';
import { RESET_MAX_REQUESTS_PER_HOUR, RESET_TOKEN_MINUTES, buildResetLink } from './password-reset-rules';
import type { MailSender } from './mail-sender';

export interface ResetDeps {
  mailer: MailSender;
  baseUrl: string;
  ownerEmail?: string;
  now: string;
}

// 'sent': đã gửi email. 'skipped': không gửi vì email không tồn tại, tài khoản bị khóa, vượt giới hạn hoặc gửi lỗi.
// Route không dùng kết quả này để đổi phản hồi, nhằm không lộ email có tồn tại hay không.
export type ForgotOutcome = 'sent' | 'skipped';

type Target = { accountId: string; address: string };

// Tìm tài khoản nhận email. Chủ website có email thật trong cấu hình, không lưu trong bảng accounts (id 'owner').
async function findTarget(db: AuthDb, email: string, ownerEmail: string | undefined): Promise<Target | null> {
  const owner = ownerEmail?.trim().toLowerCase();
  if (owner && email === owner) {
    const row = await db.prepare('SELECT active FROM accounts WHERE id=?').bind(OWNER_ACCOUNT_ID).first<{ active: number }>();
    return row && row.active === 1 ? { accountId: OWNER_ACCOUNT_ID, address: email } : null;
  }
  const row = await db
    .prepare('SELECT id, active FROM accounts WHERE email=? AND id<>?')
    .bind(email, OWNER_ACCOUNT_ID)
    .first<{ id: string; active: number }>();
  return row && row.active === 1 ? { accountId: row.id, address: email } : null;
}

// Đếm yêu cầu trong một giờ qua. Mỗi yêu cầu được gửi đều tạo một bản ghi token, nên đếm bản ghi là đủ.
async function recentRequestCount(db: AuthDb, accountId: string, now: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM password_reset_tokens WHERE account_id=? AND created>?')
    .bind(accountId, addMinutes(now, -60))
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function resetMessage(link: string): { subject: string; text: string } {
  return {
    subject: 'Đặt lại mật khẩu Sơn Trà Số',
    text: [
      'Có yêu cầu đặt lại mật khẩu cho tài khoản Sơn Trà Số của bạn.',
      '',
      `Mở liên kết sau trong vòng ${RESET_TOKEN_MINUTES} phút để đặt mật khẩu mới:`,
      link,
      '',
      'Liên kết chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu hiện tại vẫn giữ nguyên.',
    ].join('\n'),
  };
}

export async function requestPasswordReset(db: AuthDb, email: string, deps: ResetDeps): Promise<ForgotOutcome> {
  const target = await findTarget(db, email, deps.ownerEmail);
  if (!target) return 'skipped';
  if ((await recentRequestCount(db, target.accountId, deps.now)) >= RESET_MAX_REQUESTS_PER_HOUR) return 'skipped';

  // Yêu cầu mới làm vô hiệu hóa mọi token chưa dùng của cùng tài khoản (SRS FR-AUTH-11).
  await db
    .prepare('UPDATE password_reset_tokens SET used_at=? WHERE account_id=? AND used_at IS NULL')
    .bind(deps.now, target.accountId)
    .run();

  const token = newToken();
  await db
    .prepare('INSERT INTO password_reset_tokens(id,account_id,token_hash,created,expires_at,used_at) VALUES(?,?,?,?,?,NULL)')
    .bind(crypto.randomUUID(), target.accountId, await sha256Hex(token), deps.now, addMinutes(deps.now, RESET_TOKEN_MINUTES))
    .run();

  const link = buildResetLink(deps.baseUrl, token);
  const result = await deps.mailer.send({ to: target.address, ...resetMessage(link) });
  return result === 'sent' ? 'sent' : 'skipped';
}

// Dùng token một lần: đánh dấu đã dùng bằng một câu lệnh có điều kiện (không hai yêu cầu cùng dùng được một token).
// Thành công: đặt mật khẩu mới, mở khóa, vô hiệu hóa các token còn lại, đăng xuất mọi phiên (SRS FR-AUTH-08, 11).
export async function completePasswordReset(
  db: AuthDb,
  token: string,
  password: Validated<string>,
  now: string,
): Promise<'ok' | 'invalid'> {
  if (password.ok === false) return 'invalid';
  const claimed = await db
    .prepare('UPDATE password_reset_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>? RETURNING account_id')
    .bind(now, await sha256Hex(token), now)
    .first<{ account_id: string }>();
  if (!claimed) return 'invalid';

  const account = await db.prepare('SELECT active FROM accounts WHERE id=?').bind(claimed.account_id).first<{ active: number }>();
  if (!account || account.active !== 1) return 'invalid';

  await db
    .prepare('UPDATE accounts SET password_hash=?, must_change=0, failed_attempts=0, locked_until=NULL, updated=? WHERE id=?')
    .bind(await hashPassword(password.value), now, claimed.account_id)
    .run();
  await db
    .prepare('UPDATE password_reset_tokens SET used_at=? WHERE account_id=? AND used_at IS NULL')
    .bind(now, claimed.account_id)
    .run();
  await db.prepare('DELETE FROM sessions WHERE account_id=?').bind(claimed.account_id).run();
  return 'ok';
}
