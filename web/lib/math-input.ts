/**
 * Student equation input: live KaTeX preview + virtual keyboard editing.
 *
 * Preview only — correctness is decided by the server's MathChecker. The
 * notation mirrors the backend whitelist (api/app/domain/math/parser.py):
 * decimal comma (0,5), "." means multiplication, ":" "÷" "/" are division,
 * a dot between two digits is ambiguous and flagged, x is the only variable.
 */

export type Preview = { latex: string; ok: boolean; warnings: string[] };

const MUL = new Set(["*", "×", "·", "⋅", "∙", "."]);
const DIV_COLON = new Set([":", "÷"]);
const MINUS = new Set(["-", "−", "–", "—"]);
const OPEN: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSE = new Set([")", "]", "}"]);
const SUPERSCRIPT = /[⁰¹²³⁴⁵⁶⁷⁸⁹]/;

function latexBracket(ch: string): string {
  if (ch === "{") return "\\{";
  if (ch === "}") return "\\}";
  return ch;
}

/** Index of the bracket closing the one at `start`, or -1. */
function matchClose(s: string, start: number): number {
  const stack: string[] = [];
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (c in OPEN) stack.push(OPEN[c]);
    else if (CLOSE.has(c)) {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

function convert(s: string, warnings: string[]): { latex: string; ok: boolean } {
  let out = "";
  let ok = true;
  let i = 0;
  const atom = (): { latex: string; ok: boolean } | null => {
    while (i < s.length && s[i] === " ") i++;
    if (i >= s.length) return null;
    const c = s[i];
    const num = /^\d+(,\d+)?/.exec(s.slice(i));
    if (num) {
      i += num[0].length;
      return { latex: num[0].replace(",", "{,}"), ok: true };
    }
    if (c === "x" || c === "X") {
      i++;
      return { latex: "x", ok: true };
    }
    if (c in OPEN) {
      const end = matchClose(s, i);
      if (end < 0) {
        i++;
        warnings.push("Thiếu dấu đóng ngoặc");
        return { latex: latexBracket(c), ok: false };
      }
      const inner = convert(s.slice(i + 1, end), warnings);
      const close = s[end];
      i = end + 1;
      return { latex: `\\left${latexBracket(c)}${inner.latex}\\right${latexBracket(close)}`, ok: inner.ok };
    }
    return null;
  };

  while (i < s.length) {
    const c = s[i];
    if (c === " ") { i++; continue; }
    if (c === "^") {
      i++;
      const a = atom();
      if (!a) { warnings.push("Thiếu số mũ sau ^"); ok = false; break; }
      out += `^{${a.latex}}`;
      ok = ok && a.ok;
      continue;
    }
    const a = atom();
    if (a) { out += a.latex; ok = ok && a.ok; continue; }
    i++;
    if (c === "+") out += "+";
    else if (MINUS.has(c)) out += "-";
    else if (MUL.has(c)) out += "\\cdot ";
    else if (DIV_COLON.has(c)) out += "\\mathbin{:}";
    else if (c === "/") out += "/";
    else if (c === "=") out += "=";
    else if (CLOSE.has(c)) { out += latexBracket(c); ok = false; warnings.push("Thừa dấu đóng ngoặc"); }
    else { out += `\\text{${c.replace(/[\\{}$&#^_%~]/g, "?")}}`; ok = false; }
  }
  return { latex: out, ok };
}

export function previewLatex(raw: string): Preview {
  const warnings: string[] = [];
  const text = raw.normalize("NFC");
  if (/\d\s*\.\s*\d/.test(text)) warnings.push("Số thập phân dùng dấu phẩy, ví dụ 0,5");
  if (SUPERSCRIPT.test(text)) warnings.push("Dùng phím ^ để viết lũy thừa");
  if ((text.match(/=/g) ?? []).length > 1) warnings.push("Phương trình chỉ có một dấu =");
  if (/[a-wyzA-WYZ]/.test(text)) warnings.push("Chỉ dùng một ẩn x");
  const { latex, ok } = convert(text, warnings);
  return { latex, ok: ok && warnings.length === 0, warnings: [...new Set(warnings)] };
}

// ---------------------------------------------------------------- editing
export type Edit = { value: string; cursor: number };

export function insertAt(value: string, start: number, end: number, text: string): Edit {
  const v = value.slice(0, start) + text + value.slice(end);
  return { value: v, cursor: start + text.length };
}

export function backspaceAt(value: string, start: number, end: number): Edit {
  if (start !== end) return { value: value.slice(0, start) + value.slice(end), cursor: start };
  if (start === 0) return { value, cursor: 0 };
  return { value: value.slice(0, start - 1) + value.slice(start), cursor: start - 1 };
}

/** Virtual keyboard layout. `insert` is what goes into the text; `label` what the key shows. */
export const KEY_ROWS: { label: string; insert: string; aria: string }[][] = [
  [
    { label: "x", insert: "x", aria: "ẩn x" },
    { label: "+", insert: "+", aria: "cộng" },
    { label: "−", insert: "-", aria: "trừ" },
    { label: "×", insert: "×", aria: "nhân" },
    { label: ":", insert: ":", aria: "chia" },
    { label: "=", insert: "=", aria: "bằng" },
  ],
  [
    { label: "(", insert: "(", aria: "mở ngoặc" },
    { label: ")", insert: ")", aria: "đóng ngoặc" },
    { label: "a/b", insert: "/", aria: "phân số" },
    { label: "xⁿ", insert: "^", aria: "lũy thừa" },
    { label: ",", insert: ",", aria: "dấu phẩy thập phân" },
  ],
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => ({ label: d, insert: d, aria: d })),
];

/** Operations offered for a solving step (labels in student language). */
export const OPERATIONS: { value: string; label: string; needsValue: boolean; placeholder?: string }[] = [
  { value: "transpose_term", label: "Chuyển vế (đổi dấu)", needsValue: true, placeholder: "hạng tử kèm dấu, vd +5 hoặc -2x" },
  { value: "subtract_both_sides", label: "Trừ hai vế cho", needsValue: true, placeholder: "vd 5" },
  { value: "add_both_sides", label: "Cộng vào hai vế", needsValue: true, placeholder: "vd 4" },
  { value: "divide_both_sides", label: "Chia hai vế cho", needsValue: true, placeholder: "vd 2" },
  { value: "multiply_both_sides", label: "Nhân hai vế với", needsValue: true, placeholder: "vd 3" },
  { value: "expand", label: "Bỏ ngoặc", needsValue: false },
  { value: "collect_like_terms", label: "Thu gọn / rút gọn", needsValue: false },
];
