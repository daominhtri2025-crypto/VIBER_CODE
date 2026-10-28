// Dịch vụ đọc thông tin video của bài học (FR-CNT-03 đến 06; CLAUDE.md mục 3, 4.5). Chuyển từ route.ts sang đây.
// Chỉ phần truy vấn bảng videos nằm ở đây. Stream tệp từ R2 và header HTTP vẫn ở route vì là lớp truyền tải.
// Quy tắc một bài một video và giới hạn 25 MB nằm trong shared/video-rules.

export interface VideoStatement {
  bind(...values: unknown[]): VideoStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}
export interface VideoDb {
  prepare(query: string): VideoStatement;
}

export interface VideoListRow {
  lesson: number;
  duration: number;
  updated: string;
  kind: string;
  url: string | null;
}

export interface StoredVideo {
  key: string;
  mime: string;
  kind: string;
}

// Danh sách video đã đăng, theo bài. Route trả nguyên danh sách cho trang học và trang điều phối.
export async function listVideos(db: VideoDb): Promise<VideoListRow[]> {
  const { results } = await db
    .prepare('SELECT lesson,duration,updated,kind,url FROM videos ORDER BY lesson')
    .all<VideoListRow>();
  return results;
}

// Video của một bài để stream. Route kiểm tra kind === 'file' trước khi đọc R2.
export async function findVideoByLesson(db: VideoDb, lesson: number): Promise<StoredVideo | null> {
  return db
    .prepare('SELECT key,mime,kind FROM videos WHERE lesson=?')
    .bind(lesson)
    .first<StoredVideo>();
}
