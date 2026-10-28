import { checkVideoUpload, detectVideoFormat } from './video-rules';
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

// Kho tệp (Adapter cho R2 trên Sites và thư mục cục bộ). Tách ra để kiểm thử đúng thứ tự ghi và xóa.
export interface VideoStorage {
  put(key: string, body: unknown, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

// Tệp tải lên ở mức tối thiểu: kích thước, đọc đầu tệp để nhận dạng chữ ký, và luồng dữ liệu để ghi.
export interface UploadedVideoFile {
  size: number;
  head(length: number): Promise<Uint8Array>;
  stream(): unknown;
}

export type UploadOutcome =
  | { kind: 'rejected'; status: 400 | 413; error: string }
  | { kind: 'stored'; key: string; mime: string };

// Lưu tệp video của bài (FR-CNT-03, 04; quy tắc 4.5 và mục 2B). Thứ tự bắt buộc:
// 1) kiểm tra thông tin và chữ ký trước khi ghi gì; 2) ghi tệp mới vào R2; 3) ghi DB;
// 4) nếu DB lỗi thì xóa tệp mới rồi ném lỗi; 5) chỉ khi đã lưu xong mới xóa tệp cũ.
// Lỗi ghi R2 ở bước 2 được ném ra ngay, không đụng DB và không xóa tệp cũ.
export async function storeUploadedVideo(
  db: VideoDb,
  storage: VideoStorage,
  input: { lesson: number; duration: number; file: UploadedVideoFile },
  ids: { newId: string; now: string },
): Promise<UploadOutcome> {
  const check = checkVideoUpload({ lesson: input.lesson, duration: input.duration, size: input.file.size });
  if (!check.ok) return { kind: 'rejected', status: check.status, error: check.error };

  // Định dạng lấy từ chữ ký, không từ đuôi tệp hay Content-Type do client gửi (mục 2B.4).
  const mime = detectVideoFormat(await input.file.head(64));
  if (!mime) return { kind: 'rejected', status: 400, error: 'Tệp không phải MP4 hoặc WebM hợp lệ' };

  const previous = await findVideoByLesson(db, input.lesson);
  const key = `videos/${input.lesson}/${ids.newId}`;
  await storage.put(key, input.file.stream(), mime);
  try {
    await db
      .prepare(
        'INSERT INTO videos(lesson,key,mime,duration,updated,kind,url) VALUES(?,?,?,?,?,?,?) ON CONFLICT(lesson) DO UPDATE SET key=excluded.key,mime=excluded.mime,duration=excluded.duration,updated=excluded.updated,kind=excluded.kind,url=excluded.url',
      )
      .bind(input.lesson, key, mime, Math.ceil(input.duration), ids.now, 'file', null)
      .run();
  } catch (error) {
    await storage.delete(key);
    throw error;
  }
  if (previous?.kind === 'file') await storage.delete(previous.key);
  return { kind: 'stored', key, mime };
}
