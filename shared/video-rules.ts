// Quy tắc video bài học dùng chung (CLAUDE.md mục 4.5, 2B; SRS FR-CNT-04, 05, 06).
// Không phụ thuộc môi trường: dùng cho route (Sites) và kiểm thử.
import { isLessonCode } from './lesson-validation';

export const VIDEO_MAX_BYTES = 25 * 1024 * 1024; // FR-CNT-04
export const VIDEO_MAX_SECONDS = 120; // Video phải dưới 2 phút.
export const LINK_MAX_LENGTH = 500; // FR-CNT-05

// Chỉ YouTube được phép (quyết định 2). Liên kết được chuẩn hóa sang youtube-nocookie khi lưu.
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const EMBED_BASE = 'https://www.youtube-nocookie.com/embed/';

// Các thương hiệu (major brand) MP4 phổ biến cho video web. Tệp khác bị từ chối dù có ftyp.
const MP4_BRANDS = new Set(['isom', 'iso2', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ']);

export type VideoMime = 'video/mp4' | 'video/webm';

export type CheckResult = { ok: true } | { ok: false; status: 400 | 413; error: string };
export type LinkResult = { ok: true; lesson: number; embedUrl: string } | { ok: false; status: 400; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLesson(value: unknown): value is number {
  return isLessonCode(value);
}

// Lấy mã video từ các dạng liên kết YouTube thường gặp.
function extractYouTubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host === 'youtu.be') {
    return url.pathname.replace(/^\//, '').split('/')[0] || null;
  }
  if (url.pathname === '/watch') {
    return url.searchParams.get('v');
  }
  const match = url.pathname.match(/^\/(embed|shorts)\/([^/]+)$/);
  return match ? match[2] : null;
}

// Kiểm tra liên kết video (POST /api/video-link). Liên kết đã qua kiểm tra mới được lưu.
export function checkVideoLink(input: unknown): LinkResult {
  if (!isRecord(input)) return { ok: false, status: 400, error: 'Yêu cầu không hợp lệ' };
  if (!isLesson(input.lesson)) return { ok: false, status: 400, error: 'Mã bài học không hợp lệ' };
  const raw = input.url;
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > LINK_MAX_LENGTH) {
    return { ok: false, status: 400, error: `Liên kết phải từ 1 đến ${LINK_MAX_LENGTH} ký tự` };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, status: 400, error: 'Liên kết không hợp lệ' };
  }
  if (url.protocol !== 'https:') return { ok: false, status: 400, error: 'Chỉ chấp nhận liên kết https' };
  // Không cho phép thông tin đăng nhập trong URL (CLAUDE.md mục 4.5).
  if (url.username !== '' || url.password !== '') {
    return { ok: false, status: 400, error: 'Liên kết không được chứa tên người dùng hoặc mật khẩu' };
  }
  if (url.port !== '' || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, status: 400, error: 'Hiện chỉ chấp nhận liên kết YouTube' };
  }
  const id = extractYouTubeId(url);
  if (!id || !YOUTUBE_ID.test(id)) {
    return { ok: false, status: 400, error: 'Không tìm thấy mã video YouTube trong liên kết' };
  }
  return { ok: true, lesson: input.lesson, embedUrl: EMBED_BASE + id };
}

// Kiểm tra thông tin tải lên trước khi đọc nội dung tệp.
export function checkVideoUpload(input: { lesson: unknown; duration: unknown; size: number }): CheckResult {
  if (!isLesson(input.lesson)) return { ok: false, status: 400, error: 'Mã bài học không hợp lệ' };
  if (input.size > VIDEO_MAX_BYTES) return { ok: false, status: 413, error: 'Tệp tối đa 25 MB' };
  if (input.size === 0) return { ok: false, status: 400, error: 'Tệp video trống' };
  const duration = input.duration;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration >= VIDEO_MAX_SECONDS) {
    return { ok: false, status: 400, error: 'Video phải dưới 2 phút' };
  }
  return { ok: true };
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

// Nhận dạng định dạng từ chữ ký tệp (không tin Content-Type hay đuôi tệp do client gửi).
// MP4: ftyp tại byte 4–7 và major brand thuộc danh sách. WebM: EBML 1A 45 DF A3 và DocType "webm".
export function detectVideoFormat(head: Uint8Array): VideoMime | null {
  if (head.length >= 12 && ascii(head, 4, 4) === 'ftyp' && MP4_BRANDS.has(ascii(head, 8, 4))) {
    return 'video/mp4';
  }
  const isEbml = head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  if (isEbml && ascii(head, 0, head.length).includes('webm')) {
    return 'video/webm';
  }
  return null;
}
