// Dịch vụ ghi phiếu quan sát (FR-OBS-01 đến 04; CLAUDE.md mục 3, 4.2, 4.3). Chuyển từ route.ts sang đây.
// Route chỉ kiểm tra quyền, đọc yêu cầu và đổi kết quả thành HTTP; logic idempotency nằm ở đây.
// Không nhận yêu cầu HTTP: có thể dùng cho route (Sites) và máy chủ cục bộ.
import { isSameAssessmentContent, type AssessmentInput } from './assessment-rules';

// Giao diện tối thiểu khớp prepare/bind/first/run của D1 và của adapter kiểm thử.
export interface AssessmentStatement {
  bind(...values: unknown[]): AssessmentStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface AssessmentDb {
  prepare(query: string): AssessmentStatement;
}

// Kết quả để route đổi sang HTTP. "replayed" là gửi lại cùng client_id và cùng nội dung: không tạo bản ghi mới.
export type AssessmentOutcome =
  | { kind: 'unknown_learner' }
  | { kind: 'stored'; id: string }
  | { kind: 'replayed'; id: string }
  | { kind: 'conflict' }
  | { kind: 'unavailable' };

// Ghi phiếu theo (learner, client_id). INSERT ... ON CONFLICT DO NOTHING rồi đọc lại để biết phiếu nào đang được lưu:
// nếu là bản vừa chèn thì "stored"; nếu đã có và cùng nội dung thì "replayed"; khác nội dung thì "conflict".
export async function recordAssessment(
  db: AssessmentDb,
  input: AssessmentInput,
  assessorEmail: string,
  ids: { newId: string; now: string },
): Promise<AssessmentOutcome> {
  // Mã học viên được chuẩn hóa như khi đăng nhập: bỏ khoảng trắng và viết hoa.
  const learner = await db
    .prepare('SELECT id FROM learners WHERE code=?')
    .bind(input.code.trim().toUpperCase())
    .first<{ id: string }>();
  if (!learner) return { kind: 'unknown_learner' };

  await db
    .prepare('INSERT INTO assessments(id,learner,phase,scores,assessor,created,client_id) VALUES(?,?,?,?,?,?,?) ON CONFLICT(learner,client_id) DO NOTHING')
    .bind(ids.newId, learner.id, input.phase, JSON.stringify(input.scores), assessorEmail, ids.now, input.clientId)
    .run();

  const stored = await db
    .prepare('SELECT id,phase,scores FROM assessments WHERE learner=? AND client_id=?')
    .bind(learner.id, input.clientId)
    .first<{ id: string; phase: string; scores: string }>();
  if (!stored) return { kind: 'unavailable' };
  if (stored.id === ids.newId) return { kind: 'stored', id: ids.newId };
  if (!isSameAssessmentContent(stored, input)) return { kind: 'conflict' };
  return { kind: 'replayed', id: stored.id };
}
