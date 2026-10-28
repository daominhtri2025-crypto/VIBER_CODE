// Dịch vụ tiến độ học tập (FR-LRN-06, 07; CLAUDE.md mục 3, 4.1, 4.7). Chuyển từ route.ts sang đây.
// Route kiểm tra quyền và đầu vào, rồi gọi dịch vụ; câu SQL và quy tắc hợp nhất nằm ở đây.
// Quy tắc 4.1: tiến độ hợp nhất theo giá trị lớn nhất; completed_at chỉ ghi khi done chuyển 0 -> 1.

// Giao diện tối thiểu khớp prepare/bind/all/first/run/batch của D1 và của adapter kiểm thử.
export interface ProgressStatement {
  bind(...values: unknown[]): ProgressStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface ProgressDb {
  prepare(query: string): ProgressStatement;
  batch(statements: ProgressStatement[]): Promise<unknown>;
}

export interface LearnerProgressRow {
  lesson: number;
  read: number;
  done: number;
  score: number;
  updated: string;
}

// Các dòng tiến độ của khóa học cho buildCourseProgress (progress-rules).
export async function loadCourseRows(db: ProgressDb, learnerId: string): Promise<Array<{ lesson: number; done: number; completed_at: string | null }>> {
  const { results } = await db
    .prepare('SELECT lesson,done,completed_at FROM progress WHERE learner=?')
    .bind(learnerId)
    .all<{ lesson: number; done: number; completed_at: string | null }>();
  return results;
}

// Tiến độ theo bài của chính học viên, trả trong GET /api/me.
export async function loadLearnerProgress(db: ProgressDb, learnerId: string): Promise<LearnerProgressRow[]> {
  const { results } = await db
    .prepare('SELECT lesson,read,done,score,updated FROM progress WHERE learner=?')
    .bind(learnerId)
    .all<LearnerProgressRow>();
  return results;
}

// Đánh dấu hoàn thành một bài. Idempotent: gọi lại không đổi completed_at hay updated.
// Trả completed_at đang được lưu (null nếu không có).
export async function completeLesson(db: ProgressDb, learnerId: string, lesson: number, now: string): Promise<string | null> {
  await db
    .prepare(
      "INSERT INTO progress(learner,lesson,read,done,score,updated,completed_at) VALUES(?,?,0,1,0,?,?) ON CONFLICT(learner,lesson) DO UPDATE SET done=1,updated=CASE WHEN progress.done=0 THEN excluded.updated ELSE progress.updated END,completed_at=CASE WHEN progress.done=0 THEN excluded.completed_at ELSE progress.completed_at END",
    )
    .bind(learnerId, lesson, now, now)
    .run();
  const stored = await db
    .prepare('SELECT completed_at FROM progress WHERE learner=? AND lesson=?')
    .bind(learnerId, lesson)
    .first<{ completed_at: string | null }>();
  return stored?.completed_at ?? null;
}

// Đồng bộ tiến độ từ thiết bị (đường cũ). Hợp nhất bằng MAX; không suy đoán completed_at cho dòng cũ.
// Danh sách rỗng là no-op; route không gọi khi không có bài nào.
export async function syncProgress(db: ProgressDb, learnerId: string, read: number[], done: number[], now: string): Promise<void> {
  const indices = [...new Set<number>([...read, ...done])];
  if (indices.length === 0) return;
  await db.batch(
    indices.map((lesson) =>
      db
        .prepare(
          'INSERT INTO progress(learner,lesson,read,done,updated,completed_at) VALUES(?,?,?,?,?,?) ON CONFLICT(learner,lesson) DO UPDATE SET read=MAX(read,excluded.read),done=MAX(done,excluded.done),updated=excluded.updated,completed_at=CASE WHEN progress.done=0 AND excluded.done=1 THEN excluded.completed_at ELSE progress.completed_at END',
        )
        .bind(learnerId, lesson, read.includes(lesson) ? 1 : 0, done.includes(lesson) ? 1 : 0, now, done.includes(lesson) ? now : null),
    ),
  );
}

// Điểm kiểm tra chỉ tăng, không giảm (quy tắc 4.1). Được gọi từ quiz-service khi lượt làm đúng.
// Không đặt done hay completed_at: kiểm tra không phải là hoàn thành bài.
export async function recordQuizPass(db: ProgressDb, learnerId: string, lesson: number, now: string): Promise<void> {
  await db
    .prepare(
      'INSERT INTO progress(learner,lesson,read,done,score,updated,completed_at) VALUES(?,?,0,0,1,?,NULL) ON CONFLICT(learner,lesson) DO UPDATE SET score=MAX(progress.score,excluded.score)',
    )
    .bind(learnerId, lesson, now)
    .run();
}
