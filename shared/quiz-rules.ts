// Quy tắc bài kiểm tra trắc nghiệm dùng chung (Mục 2 đã duyệt; quyết định 2, 3, 5).
// Máy chủ là nơi duy nhất chấm điểm. Đáp án chỉ được đọc từ bảng lessons và không bao giờ trả về trình duyệt.
// Module thuần, không phụ thuộc môi trường: dùng được cho route (Sites) và máy chủ cục bộ.
import { LESSON_MAX, LESSON_MIN } from './lesson-validation';
import type { LessonQuiz } from './lessons-seed';

export interface QuizAnswerInput {
  code: string;
  lesson: number;
  choice: number;
  clientId: string;
}

export type QuizInputCheck = { ok: true; value: QuizAnswerInput } | { ok: false; status: 400; error: string };

// Mẫu client_id giống phiếu quan sát (quyết định 5): ký tự an toàn, không đi vào đường dẫn hay nhật ký.
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_CODE_LENGTH = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Kiểm tra cấu trúc đầu vào của POST /api/quiz/answer. Việc choice nằm trong danh sách đáp án của bài
// cần đọc dữ liệu bài, nên được kiểm tra riêng ở isChoiceInRange.
export function validateQuizAnswer(input: unknown): QuizInputCheck {
  if (!isRecord(input)) return { ok: false, status: 400, error: 'Dữ liệu không hợp lệ' };
  const { code, lesson, choice, client_id: clientId } = input;
  if (typeof code !== 'string' || code.length === 0 || code.length > MAX_CODE_LENGTH) {
    return { ok: false, status: 400, error: 'Mã học viên không hợp lệ' };
  }
  if (!Number.isInteger(lesson) || (lesson as number) < LESSON_MIN || (lesson as number) > LESSON_MAX) {
    return { ok: false, status: 400, error: 'Bài học không hợp lệ' };
  }
  if (!Number.isInteger(choice) || (choice as number) < 0) {
    return { ok: false, status: 400, error: 'Lựa chọn không hợp lệ' };
  }
  if (typeof clientId !== 'string' || !CLIENT_ID_PATTERN.test(clientId)) {
    return { ok: false, status: 400, error: 'Thiếu mã lượt làm. Vui lòng tải lại trang và thử lại.' };
  }
  return {
    ok: true,
    value: { code, lesson: lesson as number, choice: choice as number, clientId },
  };
}

// Đáp án lưu trong bảng lessons (JSON). Trả null nếu hàng hỏng, để route báo lỗi thay vì chấm sai.
export function parseStoredQuiz(raw: string): LessonQuiz | null {
  try {
    const quiz = JSON.parse(raw) as unknown;
    if (!isRecord(quiz) || typeof quiz.question !== 'string') return null;
    if (!Array.isArray(quiz.options) || !quiz.options.every((option) => typeof option === 'string')) return null;
    const { answer } = quiz;
    if (!Number.isInteger(answer) || (answer as number) < 0 || (answer as number) >= quiz.options.length) return null;
    return { question: quiz.question, options: quiz.options as string[], answer: answer as number };
  } catch {
    return null;
  }
}

export function isChoiceInRange(choice: number, optionCount: number): boolean {
  return Number.isInteger(choice) && choice >= 0 && choice < optionCount;
}

// Chấm điểm trên máy chủ: 1 là đúng, 0 là sai. Kết quả này là nguồn sự thật duy nhất cho điểm kiểm tra.
export function gradeChoice(choice: number, answer: number): 0 | 1 {
  return choice === answer ? 1 : 0;
}

// Cùng client_id mà khác bài hoặc khác lựa chọn là xung đột (409), không ghi đè lượt đã có (quyết định 5).
export function isSameQuizAttempt(
  stored: { lesson: number; choice: number },
  input: { lesson: number; choice: number },
): boolean {
  return stored.lesson === input.lesson && stored.choice === input.choice;
}

// Tỷ lệ đúng cho dashboard, dùng chú thích "kiểm tra hiểu bài nội bộ" ở giao diện (quyết định 4).
// Trả null khi chưa có lượt làm nào, không đưa về 0 để tránh hiểu nhầm là làm sai hết.
export function correctRate(attempts: number, correct: number): number | null {
  if (!Number.isInteger(attempts) || attempts <= 0) return null;
  return Math.round((correct * 100) / attempts);
}
