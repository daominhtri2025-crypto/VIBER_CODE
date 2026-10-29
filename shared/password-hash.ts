// Băm mật khẩu bằng PBKDF2-SHA256 qua WebCrypto: không thêm phụ thuộc (CLAUDE.md mục 3).
// Định dạng lưu có tên thuật toán và số vòng để có thể nâng cấp sau mà không làm hỏng mật khẩu cũ.
// Số vòng 100 000 là mức khả thi trên Workers [Cần xác minh: giới hạn vòng PBKDF2 của Cloudflare Workers].

const ALGORITHM_TAG = 'pbkdf2-sha256';
const ITERATIONS = 100_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  // Ép kiểu chỉ để tương thích kiểu WebCrypto (Uint8Array có thể trỏ tới SharedArrayBuffer); dữ liệu không đổi.
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, key, KEY_BYTES * 8);
  return new Uint8Array(bits);
}

// So sánh không rẽ nhánh theo vị trí byte sai đầu tiên; độ dài khác nhau thì trả false ngay (độ dài không phải bí mật).
export function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function constantTimeEqualText(a: string, b: string): boolean {
  return constantTimeEqualBytes(encoder.encode(a), encoder.encode(b));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${ALGORITHM_TAG}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

// Trả false cho mọi chuỗi lưu không đúng định dạng, không ném lỗi để không lộ thông tin.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== ALGORITHM_TAG) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  const actual = await derive(password, fromBase64(parts[2]), iterations);
  return constantTimeEqualBytes(actual, fromBase64(parts[3]));
}
