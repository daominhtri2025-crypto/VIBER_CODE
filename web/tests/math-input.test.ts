import { describe, expect, it } from "vitest";
import katex from "katex";
import { backspaceAt, insertAt, previewLatex } from "@/lib/math-input";

const render = (latex: string) => katex.renderToString(latex, { throwOnError: true });

describe("previewLatex", () => {
  it.each([
    ["2x+5=17", "2x+5=17"],
    ["2×x − 3 = 0,5", "2\\cdot x-3=0{,}5"],
    ["x:2=4", "x\\mathbin{:}2=4"],
    ["3(x-1)=6", "3\\left(x-1\\right)=6"],
    ["2^3x=8", "2^{3}x=8"],
    ["2^(x+1)", "2^{\\left(x+1\\right)}"],
    ["[x+1]", "\\left[x+1\\right]"],
  ])("%s", (input, latex) => {
    const p = previewLatex(input);
    expect(p.latex).toBe(latex);
    expect(p.ok).toBe(true);
    expect(() => render(p.latex)).not.toThrow();
  });

  it.each([
    ["2.5x=1", "Số thập phân dùng dấu phẩy, ví dụ 0,5"],
    ["x²=4", "Dùng phím ^ để viết lũy thừa"],
    ["x=1=2", "Phương trình chỉ có một dấu ="],
    ["2y=4", "Chỉ dùng một ẩn x"],
    ["(x+1=2", "Thiếu dấu đóng ngoặc"],
  ])("warns on %s", (input, warning) => {
    const p = previewLatex(input);
    expect(p.ok).toBe(false);
    expect(p.warnings).toContain(warning);
    expect(() => katex.renderToString(p.latex, { throwOnError: false })).not.toThrow();
  });

  it("never lets raw input inject LaTeX commands", () => {
    const p = previewLatex("x=\\href{javascript:alert(1)}{a}");
    expect(p.latex).not.toContain("\\href");
    expect(p.ok).toBe(false);
  });

  it("keeps the dot as multiplication outside digits", () => {
    expect(previewLatex("2.x=4").latex).toBe("2\\cdot x=4");
  });
});

describe("cursor editing", () => {
  it("inserts at the caret and replaces a selection", () => {
    expect(insertAt("2+5", 1, 1, "x")).toEqual({ value: "2x+5", cursor: 2 });
    expect(insertAt("2+5", 1, 2, "-")).toEqual({ value: "2-5", cursor: 2 });
  });
  it("backspaces a character or a selection", () => {
    expect(backspaceAt("2x+5", 2, 2)).toEqual({ value: "2+5", cursor: 1 });
    expect(backspaceAt("2x+5", 0, 0)).toEqual({ value: "2x+5", cursor: 0 });
    expect(backspaceAt("2x+5", 1, 3)).toEqual({ value: "25", cursor: 1 });
  });
});
