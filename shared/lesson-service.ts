// Dịch vụ bài học (FR-LRN-01, 02; quyết định 30/10/2026; CLAUDE.md mục 3, 4.4, 4.15, 4.16).
// Học viên chỉ thấy bài đang hiển thị và không có đáp án. Quản trị viên thấy đầy đủ, kể cả đáp án, để sửa.
import { LESSON_PAGE_SIZE, toLessonWrite, type AdminLessonInput } from './lesson-admin-rules';
import { toLessonResponse, type LessonResponse, type LessonRow } from './lesson-validation';
import {
  countLessons,
  insertStatement,
  selectLesson,
  selectLessonPage,
  selectLessonVersions,
  selectVisibleLessonCodes,
  selectVisibleLessons,
  updateStatement,
  versionStatement,
  visibilityStatement,
  type LessonDb,
  type LessonRecord,
  type LessonVersionRecord,
} from './lesson-repo';

export type { LessonDb } from './lesson-repo';

// Dạng trả về cho quản trị: đủ trường để sửa, kể cả đáp án đúng.
export interface AdminLesson {
  lesson: number;
  title: string;
  group_no: number;
  icon: string;
  summary: string;
  steps: string[];
  quiz: { question: string; options: string[]; answer: number };
  next_step: string;
  hidden: boolean;
  updated: string;
}

export interface AdminLessonVersion extends AdminLesson {
  id: number;
  saved_by: string;
  saved_at: string;
}

// Danh mục công khai: chỉ bài đang hiển thị. Trả null khi có hàng hỏng hoặc bảng rỗng, để route báo 503.
export async function loadLessonCatalog(db: LessonDb): Promise<LessonResponse[] | null> {
  // Bảng rỗng là chưa seed: báo lỗi. Mọi bài đều bị ẩn là trạng thái hợp lệ: trả danh mục rỗng.
  if ((await countLessons(db)) === 0) return null;
  const rows = await selectVisibleLessons(db);
  const lessons = rows.map((row) => toLessonResponse(row as LessonRow));
  if (lessons.some((lesson) => lesson === null)) return null;
  return lessons as LessonResponse[];
}

// Mã các bài đang hiển thị, dùng làm mẫu số của ngưỡng đạt (quyết định 2) và danh sách bài của tiến độ.
export async function visibleLessonCodes(db: LessonDb): Promise<number[]> {
  return selectVisibleLessonCodes(db);
}

// Bài có hiển thị với học viên không. Bài không tồn tại trả false.
export async function isLessonVisible(db: LessonDb, lesson: number): Promise<boolean> {
  const row = await selectLesson(db, lesson);
  return row !== null && row.hidden === 0;
}

// Dữ liệu bài từ một hàng; trả null nếu JSON hỏng.
function toAdminLesson(row: LessonRecord | LessonVersionRecord): AdminLesson | null {
  try {
    const body = JSON.parse(row.body) as { icon: string; summary: string; steps: string[] };
    const quiz = JSON.parse(row.quiz) as { question: string; options: string[]; answer: number };
    return {
      lesson: row.lesson,
      title: row.title,
      group_no: row.group_no,
      icon: body.icon,
      summary: body.summary,
      steps: body.steps,
      quiz: { question: quiz.question, options: quiz.options, answer: quiz.answer },
      next_step: row.next_step ?? '',
      hidden: row.hidden === 1,
      updated: 'updated' in row ? row.updated : row.saved_at,
    };
  } catch {
    return null;
  }
}

export interface AdminLessonPage {
  lessons: AdminLesson[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

// Trang quản trị: mọi bài (kể cả bài ẩn), sắp theo mã bài, 10 bài mỗi trang.
export async function listLessonsForAdmin(db: LessonDb, page: number): Promise<AdminLessonPage | null> {
  const total = await countLessons(db);
  const rows = await selectLessonPage(db, LESSON_PAGE_SIZE, (page - 1) * LESSON_PAGE_SIZE);
  const lessons = rows.map(toAdminLesson);
  if (lessons.some((lesson) => lesson === null)) return null;
  return {
    lessons: lessons as AdminLesson[],
    page,
    pageSize: LESSON_PAGE_SIZE,
    total,
    pages: Math.max(1, Math.ceil(total / LESSON_PAGE_SIZE)),
  };
}

// Thêm bài mới. Trả 'exists' khi mã đã có, để không ghi đè bài cũ (quy tắc 4.16).
export async function createLesson(db: LessonDb, input: AdminLessonInput, now: string): Promise<'ok' | 'exists'> {
  if ((await selectLesson(db, input.lesson)) !== null) return 'exists';
  await insertStatement(db, input.lesson, toLessonWrite(input), now).run();
  return 'ok';
}

// Sửa bài: lưu bản hiện tại vào lịch sử rồi mới ghi bản mới, trong một batch (quy tắc 4.4).
export async function updateLesson(
  db: LessonDb,
  input: AdminLessonInput,
  savedBy: string,
  now: string,
): Promise<'ok' | 'not_found'> {
  if ((await selectLesson(db, input.lesson)) === null) return 'not_found';
  await db.batch([
    versionStatement(db, input.lesson, savedBy, now),
    updateStatement(db, input.lesson, toLessonWrite(input), now),
  ]);
  return 'ok';
}

// Ẩn hoặc hiện bài (quy tắc 4.15). Lịch sử được ghi khi trạng thái thật sự đổi, không ghi khi không đổi.
export async function setLessonHidden(
  db: LessonDb,
  lesson: number,
  hidden: boolean,
  savedBy: string,
  now: string,
): Promise<'ok' | 'not_found' | 'unchanged'> {
  const row = await selectLesson(db, lesson);
  if (row === null) return 'not_found';
  if ((row.hidden === 1) === hidden) return 'unchanged';
  await db.batch([versionStatement(db, lesson, savedBy, now), visibilityStatement(db, lesson, hidden, now)]);
  return 'ok';
}

// Lịch sử phiên bản của một bài, mới nhất trước.
export async function listLessonVersions(db: LessonDb, lesson: number): Promise<AdminLessonVersion[] | null> {
  const rows = await selectLessonVersions(db, lesson);
  const versions: AdminLessonVersion[] = [];
  for (const row of rows) {
    const lessonView = toAdminLesson(row);
    if (lessonView === null) return null;
    versions.push({ ...lessonView, id: row.id, saved_by: row.saved_by, saved_at: row.saved_at, updated: row.saved_at });
  }
  return versions;
}
