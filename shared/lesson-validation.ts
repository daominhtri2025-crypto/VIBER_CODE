// Kiểm tra và ánh xạ bài học dùng chung (CLAUDE.md mục 3, 4.4).
// Dùng cho: kiểm tra dữ liệu seed trước khi ghi, và kiểm tra hàng D1 trước khi trả về API.
import { LESSON_GROUP_NAMES, type LessonQuiz, type LessonSeed } from './lessons-seed';

export const LESSON_MIN = 0;
export const LESSON_MAX = 9; // Khớp CHECK trong bảng lessons (0001): bộ bài cố định 10 bài.
export const GROUP_MIN = 1;
export const GROUP_MAX = LESSON_GROUP_NAMES.length; // 5
export const LESSON_COUNT = LESSON_MAX - LESSON_MIN + 1; // 10

// Hàng bảng lessons (xem db/schema.ts). body và quiz là JSON TEXT.
export interface LessonRow {
  lesson: number;
  title: string;
  group_no: number;
  body: string;
  quiz: string;
  next_step: string | null;
}

// Dạng trả về cho trình duyệt. Không có đáp án: máy chủ tự chấm bài kiểm tra (Mục 2, quyết định 2 và 3).
export interface LessonResponse {
  lesson: number;
  title: string;
  group_no: number;
  icon: string;
  summary: string;
  steps: string[];
  quiz: { question: string; options: string[] };
  next_step: string;
}

export type LessonCheck = { ok: true } | { ok: false; error: string };

const MAX_TITLE = 120;
const MAX_TEXT = 300;
const MAX_ICON = 8;
const MAX_STEPS = 10;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 5;

function isNonEmptyString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

// Kiểm tra cấu trúc một bài trước khi seed. Trả lỗi đầu tiên tìm được.
export function checkLessonSeed(item: LessonSeed): LessonCheck {
  if (!Number.isInteger(item.lesson) || item.lesson < LESSON_MIN || item.lesson > LESSON_MAX) {
    return { ok: false, error: 'Mã bài phải nằm trong 0–9' };
  }
  if (!isNonEmptyString(item.title, MAX_TITLE)) return { ok: false, error: 'Tiêu đề bài không hợp lệ' };
  if (!Number.isInteger(item.groupNo) || item.groupNo < GROUP_MIN || item.groupNo > GROUP_MAX) {
    return { ok: false, error: 'Nhóm phải nằm trong 1–5' };
  }
  if (!isNonEmptyString(item.icon, MAX_ICON)) return { ok: false, error: 'Biểu tượng không hợp lệ' };
  if (!isNonEmptyString(item.summary, MAX_TEXT)) return { ok: false, error: 'Mô tả không hợp lệ' };
  if (!Array.isArray(item.steps) || item.steps.length === 0 || item.steps.length > MAX_STEPS) {
    return { ok: false, error: 'Số bước phải từ 1 đến 10' };
  }
  if (!item.steps.every((step) => isNonEmptyString(step, MAX_TEXT))) return { ok: false, error: 'Có bước không hợp lệ' };
  if (!isNonEmptyString(item.quiz?.question, MAX_TEXT)) return { ok: false, error: 'Câu hỏi không hợp lệ' };
  const options = item.quiz.options;
  if (!Array.isArray(options) || options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
    return { ok: false, error: 'Số đáp án phải từ 2 đến 5' };
  }
  if (!options.every((option) => isNonEmptyString(option, MAX_TEXT))) return { ok: false, error: 'Có đáp án không hợp lệ' };
  if (!Number.isInteger(item.quiz.answer) || item.quiz.answer < 0 || item.quiz.answer >= options.length) {
    return { ok: false, error: 'Chỉ số đáp án đúng nằm ngoài danh sách' };
  }
  if (!isNonEmptyString(item.nextStep, MAX_TEXT)) return { ok: false, error: 'Bước tiếp theo không hợp lệ' };
  return { ok: true };
}

// Chuyển dữ liệu seed sang hàng bảng (không gồm created; cột này do migration 0002 đặt).
export function toLessonRow(item: LessonSeed): LessonRow {
  return {
    lesson: item.lesson,
    title: item.title,
    group_no: item.groupNo,
    body: JSON.stringify({ icon: item.icon, summary: item.summary, steps: item.steps }),
    quiz: JSON.stringify(item.quiz),
    next_step: item.nextStep,
  };
}

interface StoredBody {
  icon: string;
  summary: string;
  steps: string[];
}

// Đọc hàng từ D1 thành dạng API. Trả null nếu hàng hỏng, để route báo 503 thay vì trả dữ liệu sai.
export function toLessonResponse(row: LessonRow): LessonResponse | null {
  try {
    const body = JSON.parse(row.body) as StoredBody;
    // Đọc đầy đủ đáp án để kiểm tra cấu trúc, nhưng chỉ đưa câu hỏi và các lựa chọn ra ngoài.
    const quiz = JSON.parse(row.quiz) as LessonQuiz;
    const response: LessonResponse = {
      lesson: row.lesson,
      title: row.title,
      group_no: row.group_no,
      icon: body.icon,
      summary: body.summary,
      steps: body.steps,
      quiz: { question: quiz.question, options: quiz.options },
      next_step: row.next_step ?? '',
    };
    const check = checkLessonSeed({
      lesson: response.lesson,
      title: response.title,
      groupNo: response.group_no,
      icon: response.icon,
      summary: response.summary,
      steps: response.steps,
      quiz,
      nextStep: response.next_step,
    });
    return check.ok ? response : null;
  } catch {
    return null;
  }
}
