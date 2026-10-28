// Dịch vụ đọc thông tin video của bài học (FR-CNT-03 đến 06; CLAUDE.md mục 3, 4.5). Chuyển từ route.ts sang đây.
// Chỉ phần truy vấn bảng videos nằm ở đây. Stream tệp từ R2 và header HTTP vẫn ở route vì là lớp truyền tải.
// Quy tắc một bài một video và giới hạn 25 MB nằm trong shared/video-rules.

export interface VideoStatement {
  bind(...values: unknown[]): VideoStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
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

// Thay video của bài bằng liên kết YouTube (FR-CNT-05, 06; quy tắc 4.5: mỗi bài đúng một video).
// Ghi đè hàng cũ rồi trả khóa R2 của tệp cũ (nếu có) để route xóa sau khi đã ghi DB.
// Thứ tự này giữ nguyên hành vi cũ: tệp chỉ bị xóa khi bản ghi mới đã được lưu.
export async function replaceWithVideoLink(
  db: VideoDb,
  lesson: number,
  embedUrl: string,
  now: string,
): Promise<{ previousFileKey: string | null }> {
  const previous = await findVideoByLesson(db, lesson);
  await db
    .prepare(
      "INSERT INTO videos(lesson,key,mime,duration,updated,kind,url) VALUES(?,'','',0,?,'link',?) ON CONFLICT(lesson) DO UPDATE SET key='',mime='',duration=0,updated=excluded.updated,kind='link',url=excluded.url",
    )
    .bind(lesson, now, embedUrl)
    .run();
  return { previousFileKey: previous?.kind === 'file' ? previous.key : null };
}
