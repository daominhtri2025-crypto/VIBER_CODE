import { NEWS_LIST_LIMIT, type NewsInput } from './news-rules';
import { insertNews, newsExists, selectAllNews, selectVisibleNews, updateNewsRow, type NewsDb, type NewsRow } from './news-repo';
// Dịch vụ tin tức (CLAUDE.md mục 3): ghép quy tắc với lớp dữ liệu và chuyển sang dạng trả về cho API.

export interface NewsItem {
  id: number;
  title: string;
  summary: string;
  content: string;
  source_url: string | null;
  hidden: boolean;
  published_at: string;
  updated: string;
}

const toItem = (row: NewsRow): NewsItem => ({
  id: row.id,
  title: row.title,
  summary: row.summary,
  content: row.content,
  source_url: row.source_url,
  hidden: row.hidden === 1,
  published_at: row.published_at,
  updated: row.updated,
});

// Trang chủ: chỉ tin đang hiển thị. Tin ẩn không bao giờ rời máy chủ qua đường công khai.
export async function listPublicNews(db: NewsDb): Promise<NewsItem[]> {
  return (await selectVisibleNews(db, NEWS_LIST_LIMIT)).map(toItem);
}

// Trang quản trị: toàn bộ tin, gồm tin đã ẩn.
export async function listAllNews(db: NewsDb): Promise<NewsItem[]> {
  return (await selectAllNews(db)).map(toItem);
}

// Đăng tin mới. Thời điểm đăng do máy chủ ghi, không nhận từ client.
export async function createNews(db: NewsDb, input: NewsInput, createdBy: string, now: string): Promise<number> {
  return insertNews(db, input, createdBy, now);
}

// Sửa tin đã có. Trả 'not_found' khi mã không tồn tại thay vì tạo bản mới.
export async function updateNews(db: NewsDb, id: number, input: NewsInput, now: string): Promise<'ok' | 'not_found'> {
  if (!(await newsExists(db, id))) return 'not_found';
  await updateNewsRow(db, id, input, now);
  return 'ok';
}
