// Quy tắc phiếu quan sát dùng chung (CLAUDE.md mục 3, 4.2, 4.3).
// Module thuần, không phụ thuộc môi trường: có thể dùng cho route (Sites) và máy chủ cục bộ.

export const ASSESSMENT_PHASES = ['Trước học', 'Sau học', 'Kiểm tra lại 3–7 ngày'] as const;
export type AssessmentPhase = (typeof ASSESSMENT_PHASES)[number];

// null nghĩa là "chưa đánh giá", KHÔNG phải 0 (quy tắc 4.2).
export type Score = 0 | 1 | 2 | 3 | null;

export interface AssessmentInput {
  clientId: string;
  code: string;
  phase: AssessmentPhase;
  scores: Score[];
}

export type ValidationResult = { ok: true; value: AssessmentInput } | { ok: false; error: string };

// Khóa idempotency do client sinh (FR-OBS-04). Chỉ cho phép ký tự an toàn để không lộ vào đường dẫn hay nhật ký.
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_CODE_LENGTH = 40;
const SCORE_COUNT = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScore(value: unknown): value is Score {
  return value === null || (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 3);
}

// Kiểm tra đầu vào của POST /api/assessment. Thiếu client_id là lỗi 400, không tự sinh ở máy chủ
// vì khi đó không còn đảm bảo idempotency.
export function validateAssessment(input: unknown): ValidationResult {
  if (!isRecord(input)) return { ok: false, error: 'Phiếu không hợp lệ' };
  if (typeof input.client_id !== 'string' || !CLIENT_ID_PATTERN.test(input.client_id)) {
    return { ok: false, error: 'Thiếu mã phiếu. Vui lòng tải lại trang và thử lại.' };
  }
  if (input.observed !== true) return { ok: false, error: 'Phiếu không hợp lệ' };
  if (!(ASSESSMENT_PHASES as readonly unknown[]).includes(input.phase)) return { ok: false, error: 'Phiếu không hợp lệ' };
  if (typeof input.code !== 'string' || input.code.length > MAX_CODE_LENGTH) return { ok: false, error: 'Phiếu không hợp lệ' };
  if (!Array.isArray(input.scores) || input.scores.length !== SCORE_COUNT || !input.scores.every(isScore)) {
    return { ok: false, error: 'Phiếu không hợp lệ' };
  }
  return {
    ok: true,
    value: {
      clientId: input.client_id,
      code: input.code,
      phase: input.phase as AssessmentPhase,
      scores: input.scores as Score[],
    },
  };
}

// Hai phiếu có cùng nội dung khi cùng phase và cùng scores (null khớp null, 0 khác null).
// Người đánh giá không nằm trong so sánh: cùng client_id từ người đánh giá khác vẫn là một phiếu.
// observed không lưu trong DB vì mọi phiếu đã lưu đều phải có observed = true (đã kiểm tra ở validateAssessment).
export function isSameAssessmentContent(
  stored: { phase: string; scores: string },
  input: Pick<AssessmentInput, 'phase' | 'scores'>,
): boolean {
  if (stored.phase !== input.phase) return false;
  let storedScores: unknown;
  try {
    storedScores = JSON.parse(stored.scores);
  } catch {
    return false;
  }
  if (!Array.isArray(storedScores) || storedScores.length !== input.scores.length) return false;
  return input.scores.every((score, index) => storedScores[index] === score);
}
