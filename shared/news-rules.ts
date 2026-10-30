// Quy tắc tin tức trang chủ (Sơn Trà Số, giai đoạn 1: quản trị viên đăng tay).
// Mọi dữ liệu từ client đi qua đây trước khi chạm cơ sở dữ liệu. Tin chỉ hiển thị dưới dạng văn bản thuần.

export const NEWS_TITLE_MAX = 200;
export const NEWS_SUMMARY_MAX = 500;
export const NEWS_CONTENT_MAX = 5000;
export const NEWS_URL_MAX = 500;
export const NEWS_LIST_LIMIT = 20;

export interface NewsInput {
  title: string;
  summary: string;
  content: string;
  sourceUrl: string | null;
  hidden: boolean;
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Liên kết nguồn chỉ nhận https, không chứa thông tin đăng nhập, tối đa 500 ký tự. Trống nghĩa là không có nguồn.
export function checkSourceUrl(raw: unknown): Checked<string | null> {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  const bad = { ok: false as const, error: 'Liên kết nguồn phải bắt đầu bằng https:// và không chứa tên đăng nhập' };
  if (typeof raw !== 'string' || raw.length > NEWS_URL_MAX) return bad;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return bad; }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return bad;
  return { ok: true, value: url.toString() };
}

// Kiểm tra một trường chuỗi: bắt buộc hoặc tùy chọn, có giới hạn độ dài sau khi cắt khoảng trắng đầu cuối.
function checkText(raw: unknown, label: string, max: number, required: boolean): Checked<string> {
  if (raw === undefined || raw === null || raw === '') {
    return required ? { ok: false, error: `${label} không được để trống` } : { ok: true, value: '' };
  }
  if (typeof raw !== 'string') return { ok: false, error: `${label} không hợp lệ` };
  const text = raw.trim();
  if (required && text.length === 0) return { ok: false, error: `${label} không được để trống` };
  if (text.length > max) return { ok: false, error: `${label} tối đa ${max} ký tự` };
  return { ok: true, value: text };
}

// Dữ liệu đăng hoặc sửa tin. hidden mặc định là false; mọi trường khác phải đúng kiểu.
export function validateNewsInput(body: unknown): Checked<NewsInput> {
  if (!isRecord(body)) return { ok: false, error: 'Dữ liệu tin không hợp lệ' };
  const title = checkText(body.title, 'Tiêu đề', NEWS_TITLE_MAX, true);
  if (!title.ok) return title;
  const summary = checkText(body.summary, 'Tóm tắt', NEWS_SUMMARY_MAX, false);
  if (!summary.ok) return summary;
  const content = checkText(body.content, 'Nội dung', NEWS_CONTENT_MAX, false);
  if (!content.ok) return content;
  const source = checkSourceUrl(body.source_url);
  if (!source.ok) return source;
  if (body.hidden !== undefined && typeof body.hidden !== 'boolean') return { ok: false, error: 'Trường ẩn tin phải là đúng hoặc sai' };
  return {
    ok: true,
    value: {
      title: title.value,
      summary: summary.value,
      content: content.value,
      sourceUrl: source.value,
      hidden: body.hidden === true,
    },
  };
}

// Mã tin khi sửa: số nguyên dương. Không nhận chuỗi số để tránh lẫn với mã từ đường dẫn.
export function validateNewsId(raw: unknown): Checked<number> {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0) return { ok: false, error: 'Mã tin không hợp lệ' };
  return { ok: true, value: raw };
}
