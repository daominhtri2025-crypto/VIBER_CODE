import { isLessonCode } from './lesson-validation';

// Tiến độ học tập (Commit 1.6). Ứng dụng chỉ có một khóa học cố định gồm 10 bài; không có bảng khóa học riêng.
export const COURSE_ID = 'son-tra-so';

// Quy tắc 4.7: "hoàn thành" chỉ là tự xác nhận của học viên, không phải bằng chứng năng lực.
// Tên trường `completed_lessons` và chuỗi giao diện phải giữ nghĩa này, không gọi là "đạt" hay "thành thạo".

export interface CompleteInput {
  code: string;
  lesson: number;
}

export type CompleteCheck =
  | { ok: true; value: CompleteInput }
  | { ok: false; status: 400; error: string };

// Kiểm tra đầu vào của POST /api/progress/complete. Mã học viên khớp với phiên được kiểm tra ở route.
export function validateComplete(input: unknown): CompleteCheck {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, status: 400, error: 'Dữ liệu không hợp lệ' };
  }
  const body = input as Record<string, unknown>;
  const code = body.code;
  const lesson = body.lesson;
  if (typeof code !== 'string' || code.length === 0 || code.length > 40) {
    return { ok: false, status: 400, error: 'Mã học viên không hợp lệ' };
  }
  // Số nguyên không âm trong giới hạn mã bài: loại bỏ số thực, chuỗi và giá trị ngoài giới hạn.
  if (typeof lesson !== 'number' || !isLessonCode(lesson)) {
    return { ok: false, status: 400, error: 'Bài học không hợp lệ' };
  }
  return { ok: true, value: { code, lesson } };
}

export interface CourseRow {
  lesson: number;
  done: number;
  completed_at: string | null;
}

export interface LessonStatus {
  lesson: number;
  completed: boolean;
  completed_at: string | null;
}

export interface CourseProgress {
  course: string;
  total: number;
  completed_lessons: number;
  percent: number;
  lessons: LessonStatus[];
}

// Tính tiến độ khóa học trên danh sách bài đang hiển thị (lessonCodes, quyết định 30/10/2026).
// Quy tắc: bài chưa có dòng hoặc done = 0 là chưa hoàn thành; dòng của bài không còn hiển thị bị bỏ qua.
// completed_at chỉ để hiển thị; việc đếm dựa trên done, nên dòng cũ có completed_at NULL vẫn được tính.
export function buildCourseProgress(rows: CourseRow[], lessonCodes: number[]): CourseProgress {
  const visible = [...new Set(lessonCodes)].filter(isLessonCode).sort((a, b) => a - b);
  const byLesson = new Map<number, CourseRow>();
  for (const row of rows) byLesson.set(row.lesson, row);
  const lessons: LessonStatus[] = visible.map((lesson) => {
    const row = byLesson.get(lesson);
    const completed = row?.done === 1;
    return { lesson, completed, completed_at: completed ? (row?.completed_at ?? null) : null };
  });
  const total = lessons.length;
  const completedLessons = lessons.filter((item) => item.completed).length;
  return {
    course: COURSE_ID,
    total,
    completed_lessons: completedLessons,
    percent: total === 0 ? 0 : Math.round((completedLessons * 100) / total),
    lessons,
  };
}
