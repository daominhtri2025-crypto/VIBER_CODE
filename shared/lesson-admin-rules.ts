// Quy tắc nhập liệu quản lý bài học (quyết định 30/10/2026; CLAUDE.md mục 4.4, 4.15, 4.16).
// Mọi dữ liệu từ client đi qua đây trước khi chạm cơ sở dữ liệu. Dùng lại checkLessonSeed để chỉ có một bộ luật cho nội dung bài.
import { checkLessonSeed, isLessonCode, toLessonRow, type LessonCheck } from './lesson-validation';
import type { LessonSeed } from './lessons-seed';
import type { LessonWrite } from './lesson-repo';

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

export interface AdminLessonInput {
  lesson: number;
  title: string;
  groupNo: number;
  icon: string;
  summary: string;
  steps: string[];
  quiz: { question: string; options: string[]; answer: number };
  nextStep: string;
}

const MAX_PAGE = 10_000;
export const LESSON_PAGE_SIZE = 10;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Cắt khoảng trắng khi là chuỗi; giá trị khác kiểu giữ nguyên để kiểm tra kiểu bắt được.
const trimmed = (value: unknown): unknown => (typeof value === 'string' ? value.trim() : value);

// Dữ liệu bài đầy đủ từ trang quản trị. Mã bài lấy từ client nhưng phải là số nguyên hợp lệ.
export function validateLessonInput(body: unknown): Checked<AdminLessonInput> {
  if (!isRecord(body)) return { ok: false, error: 'Dữ liệu bài học không hợp lệ' };
  if (!isLessonCode(body.lesson)) return { ok: false, error: 'Mã bài phải là số nguyên không âm trong giới hạn cho phép' };
  const quiz = body.quiz;
  if (!isRecord(quiz)) return { ok: false, error: 'Bài kiểm tra không hợp lệ' };
  const options = Array.isArray(quiz.options) ? quiz.options.map(trimmed) : quiz.options;
  const steps = Array.isArray(body.steps) ? body.steps.map(trimmed) : body.steps;
  // Kiểu đã được checkLessonSeed kiểm tra bên dưới; ép kiểu ở đây chỉ để gọi hàm kiểm tra chung.
  const seed = {
    lesson: body.lesson,
    title: trimmed(body.title),
    groupNo: body.group_no,
    icon: trimmed(body.icon),
    summary: trimmed(body.summary),
    steps,
    quiz: { question: trimmed(quiz.question), options, answer: quiz.answer },
    nextStep: trimmed(body.next_step),
  } as unknown as LessonSeed;
  const check: LessonCheck = checkLessonSeed(seed);
  if (!check.ok) return check;
  return {
    ok: true,
    value: {
      lesson: seed.lesson,
      title: seed.title,
      groupNo: seed.groupNo,
      icon: seed.icon,
      summary: seed.summary,
      steps: seed.steps,
      quiz: seed.quiz as AdminLessonInput['quiz'],
      nextStep: seed.nextStep,
    },
  };
}

// Chuyển dữ liệu đã kiểm tra sang dạng ghi vào bảng (body và quiz là JSON TEXT).
export function toLessonWrite(input: AdminLessonInput): LessonWrite {
  const row = toLessonRow({
    lesson: input.lesson,
    title: input.title,
    groupNo: input.groupNo,
    icon: input.icon,
    summary: input.summary,
    steps: input.steps,
    quiz: input.quiz,
    nextStep: input.nextStep,
  });
  return { title: row.title, groupNo: row.group_no, body: row.body, quiz: row.quiz, nextStep: row.next_step ?? '' };
}

// Đổi trạng thái hiển thị: chỉ nhận mã bài và cờ boolean.
export function validateVisibility(body: unknown): Checked<{ lesson: number; hidden: boolean }> {
  if (!isRecord(body)) return { ok: false, error: 'Dữ liệu không hợp lệ' };
  if (!isLessonCode(body.lesson)) return { ok: false, error: 'Mã bài không hợp lệ' };
  if (typeof body.hidden !== 'boolean') return { ok: false, error: 'Trạng thái ẩn phải là đúng hoặc sai' };
  return { ok: true, value: { lesson: body.lesson, hidden: body.hidden } };
}

// Số trang: nguyên dương, có trần để không đọc quá sâu. Thiếu tham số thì lấy trang 1.
export function validatePage(raw: string | null): Checked<number> {
  if (raw === null || raw === '') return { ok: true, value: 1 };
  const page = Number(raw);
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) return { ok: false, error: 'Số trang không hợp lệ' };
  return { ok: true, value: page };
}

// Mã bài trong chuỗi truy vấn (GET ...?lesson=N).
export function validateLessonQuery(raw: string | null): Checked<number> {
  const lesson = raw === null ? NaN : Number(raw);
  if (!isLessonCode(lesson)) return { ok: false, error: 'Mã bài không hợp lệ' };
  return { ok: true, value: lesson };
}
