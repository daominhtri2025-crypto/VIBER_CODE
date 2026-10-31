// Lớp truy cập dữ liệu bài học (CLAUDE.md mục 3). Chỉ chứa SQL; quy tắc nằm ở lesson-admin-rules và lesson-service.
// Interface prepare/bind/first/all/run/batch dùng chung với D1 và SQLite kiểm thử.

export interface LessonStatement {
  bind(...values: unknown[]): LessonStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface LessonDb {
  prepare(query: string): LessonStatement;
  batch(statements: LessonStatement[]): Promise<unknown>;
}

// Hàng bảng lessons sau migration 0010. body và quiz là JSON TEXT.
export interface LessonRecord {
  lesson: number;
  title: string;
  group_no: number;
  body: string;
  quiz: string;
  next_step: string | null;
  created: string;
  updated: string;
  hidden: number;
}

// Hàng lịch sử phiên bản (lesson_versions). hidden là trạng thái TRƯỚC khi thay đổi.
export interface LessonVersionRecord {
  id: number;
  lesson: number;
  title: string;
  group_no: number;
  body: string;
  quiz: string;
  next_step: string | null;
  hidden: number;
  saved_by: string;
  saved_at: string;
}

export interface LessonWrite {
  title: string;
  groupNo: number;
  body: string;
  quiz: string;
  nextStep: string;
}

const COLUMNS = 'lesson,title,group_no,body,quiz,next_step,created,updated,hidden';

// Bài đang hiển thị với học viên, theo thứ tự mã bài.
export async function selectVisibleLessons(db: LessonDb): Promise<LessonRecord[]> {
  const { results } = await db.prepare(`SELECT ${COLUMNS} FROM lessons WHERE hidden = 0 ORDER BY lesson`).all<LessonRecord>();
  return results;
}

// Mã các bài đang hiển thị, dùng làm mẫu số của ngưỡng đạt và danh sách bài của tiến độ.
export async function selectVisibleLessonCodes(db: LessonDb): Promise<number[]> {
  const { results } = await db.prepare('SELECT lesson FROM lessons WHERE hidden = 0 ORDER BY lesson').all<{ lesson: number }>();
  return results.map((row) => Number(row.lesson));
}

// Toàn bộ bài (kể cả bài ẩn), phân trang cho trang quản trị.
export async function selectLessonPage(db: LessonDb, limit: number, offset: number): Promise<LessonRecord[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM lessons ORDER BY lesson LIMIT ? OFFSET ?`)
    .bind(limit, offset)
    .all<LessonRecord>();
  return results;
}

export async function countLessons(db: LessonDb): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM lessons').first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function selectLesson(db: LessonDb, lesson: number): Promise<LessonRecord | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM lessons WHERE lesson = ?`).bind(lesson).first<LessonRecord>();
}

// Lịch sử phiên bản của một bài, mới nhất trước.
export async function selectLessonVersions(db: LessonDb, lesson: number): Promise<LessonVersionRecord[]> {
  const { results } = await db
    .prepare(
      'SELECT id,lesson,title,group_no,body,quiz,next_step,hidden,saved_by,saved_at FROM lesson_versions WHERE lesson = ? ORDER BY saved_at DESC, id DESC',
    )
    .bind(lesson)
    .all<LessonVersionRecord>();
  return results;
}

// Hai câu lệnh dưới đây chạy trong một batch: lưu bản hiện tại vào lịch sử rồi mới ghi bản mới.
// Nếu một câu lệnh lỗi, D1 hủy cả batch nên không có bản ghi lịch sử mồ côi.
export function versionStatement(db: LessonDb, lesson: number, savedBy: string, savedAt: string): LessonStatement {
  return db
    .prepare(
      'INSERT INTO lesson_versions (lesson,title,group_no,body,quiz,next_step,hidden,saved_by,saved_at) ' +
        'SELECT lesson,title,group_no,body,quiz,next_step,hidden,?,? FROM lessons WHERE lesson = ?',
    )
    .bind(savedBy, savedAt, lesson);
}

export function updateStatement(db: LessonDb, lesson: number, write: LessonWrite, updatedAt: string): LessonStatement {
  return db
    .prepare('UPDATE lessons SET title=?, group_no=?, body=?, quiz=?, next_step=?, updated=? WHERE lesson=?')
    .bind(write.title, write.groupNo, write.body, write.quiz, write.nextStep, updatedAt, lesson);
}

export function visibilityStatement(db: LessonDb, lesson: number, hidden: boolean, updatedAt: string): LessonStatement {
  return db.prepare('UPDATE lessons SET hidden=?, updated=? WHERE lesson=?').bind(hidden ? 1 : 0, updatedAt, lesson);
}

export function insertStatement(db: LessonDb, lesson: number, write: LessonWrite, createdAt: string): LessonStatement {
  return db
    .prepare('INSERT INTO lessons (lesson,title,group_no,body,quiz,next_step,created,updated,hidden) VALUES (?,?,?,?,?,?,?,?,0)')
    .bind(lesson, write.title, write.groupNo, write.body, write.quiz, write.nextStep, createdAt, createdAt);
}
