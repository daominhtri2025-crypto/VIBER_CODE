import type { NewsInput } from './news-rules';
// Lớp truy cập dữ liệu của tin tức (CLAUDE.md mục 3). Chỉ chứa SQL; quy tắc nằm ở news-rules và news-service.

export interface NewsStatement {
  bind(...values: unknown[]): NewsStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface NewsDb {
  prepare(query: string): NewsStatement;
}

export interface NewsRow {
  id: number;
  title: string;
  summary: string;
  content: string;
  source_url: string | null;
  hidden: number;
  published_at: string;
  updated: string;
}

const COLUMNS = 'id,title,summary,content,source_url,hidden,published_at,updated';

// Tin hiển thị công khai: chưa bị ẩn, mới nhất trước.
export async function selectVisibleNews(db: NewsDb, limit: number): Promise<NewsRow[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM news WHERE hidden = 0 ORDER BY published_at DESC, id DESC LIMIT ?`)
    .bind(limit)
    .all<NewsRow>();
  return results;
}

// Toàn bộ tin, kể cả tin ẩn, dành cho trang quản trị.
export async function selectAllNews(db: NewsDb): Promise<NewsRow[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM news ORDER BY published_at DESC, id DESC`)
    .all<NewsRow>();
  return results;
}

export async function newsExists(db: NewsDb, id: number): Promise<boolean> {
  return (await db.prepare('SELECT id FROM news WHERE id = ?').bind(id).first()) !== null;
}

// Thêm tin mới và trả về mã tin vừa tạo.
export async function insertNews(db: NewsDb, input: NewsInput, createdBy: string, now: string): Promise<number> {
  const row = await db
    .prepare('INSERT INTO news (title,summary,content,source_url,hidden,published_at,created_by,created,updated) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id')
    .bind(input.title, input.summary, input.content, input.sourceUrl, input.hidden ? 1 : 0, now, createdBy, now, now)
    .first<{ id: number }>();
  if (!row) throw new Error('insert news returned no id');
  return row.id;
}

// Sửa nội dung hoặc trạng thái ẩn. Không đổi published_at để thứ tự tin không bị xáo khi sửa lỗi chính tả.
export async function updateNewsRow(db: NewsDb, id: number, input: NewsInput, now: string): Promise<void> {
  await db
    .prepare('UPDATE news SET title = ?, summary = ?, content = ?, source_url = ?, hidden = ?, updated = ? WHERE id = ?')
    .bind(input.title, input.summary, input.content, input.sourceUrl, input.hidden ? 1 : 0, now, id)
    .run();
}
