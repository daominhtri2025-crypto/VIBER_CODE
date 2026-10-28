// Dịch vụ đọc danh mục bài học (FR-LRN-01, 02; CLAUDE.md mục 3). Chuyển từ route.ts sang đây.
// Đáp án không nằm trong kết quả: toLessonResponse chỉ trả đề bài, lựa chọn và nội dung bài.
// Trả null khi dữ liệu bài thiếu hoặc hỏng, để route báo 503 thay vì trả danh mục không đầy đủ.
import { LESSON_COUNT, toLessonResponse, type LessonResponse, type LessonRow } from './lesson-validation';

// Giao diện tối thiểu khớp prepare/all của D1 và của adapter kiểm thử.
export interface LessonStatement {
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}
export interface LessonDb {
  prepare(query: string): LessonStatement;
}

export async function loadLessonCatalog(db: LessonDb): Promise<LessonResponse[] | null> {
  const { results } = await db
    .prepare('SELECT lesson,title,group_no,body,quiz,next_step FROM lessons ORDER BY lesson')
    .all<LessonRow>();
  const lessons = results.map(toLessonResponse);
  if (lessons.length !== LESSON_COUNT || lessons.some((lesson) => lesson === null)) return null;
  return lessons as LessonResponse[];
}
