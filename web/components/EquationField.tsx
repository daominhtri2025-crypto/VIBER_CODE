"use client";

import { useId, useRef, useState } from "react";
import { MathText } from "./MathText";
import { KEY_ROWS, backspaceAt, insertAt, previewLatex } from "@/lib/math-input";

/**
 * Text input + optional on-screen symbol keyboard + live KaTeX preview (decision 14/10/2026).
 * When the symbol keyboard is open on touch devices, inputMode="none" keeps the OS keyboard
 * from covering the page.
 */
export function EquationField({ label, value, onChange, placeholder, autoFocus, name }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; name?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [pad, setPad] = useState(false);
  const preview = previewLatex(value);

  function apply(edit: { value: string; cursor: number }) {
    onChange(edit.value);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(edit.cursor, edit.cursor);
    });
  }
  const sel = () => [ref.current?.selectionStart ?? value.length, ref.current?.selectionEnd ?? value.length] as const;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <input
          id={id} ref={ref} name={name} value={value} autoFocus={autoFocus} autoComplete="off" spellCheck={false}
          inputMode={pad ? "none" : "text"} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="ink min-h-12 w-full rounded-lg border border-[#c5cfe3] bg-white px-3 text-lg tracking-wide focus:border-ink"
          aria-describedby={`${id}-preview`}
        />
        <button type="button" onClick={() => setPad(!pad)} aria-expanded={pad} aria-controls={`${id}-pad`}
          className="min-h-12 shrink-0 rounded-lg border border-[#c5cfe3] bg-white px-3 text-sm text-ink hover:border-ink">
          {pad ? "Ẩn phím" : "Phím Toán"}
        </button>
      </div>
      <div id={`${id}-preview`} aria-live="polite" className="mt-2 min-h-9 rounded-md px-1">
        {value.trim() ? (
          <>
            <MathText value={value} className="ink" />
            {preview.warnings.map((w) => <p key={w} className="text-sm text-hl-ink">{w}</p>)}
          </>
        ) : <span className="text-sm text-muted">Phương trình sẽ hiện ở đây khi em gõ.</span>}
      </div>
      {pad && (
        <div id={`${id}-pad`} role="group" aria-label="Bàn phím ký hiệu Toán" className="mt-2 grid gap-2">
          {KEY_ROWS.map((row, r) => (
            <div key={r} className="grid grid-cols-6 gap-2 sm:grid-cols-10">
              {row.map((k) => (
                <button key={k.label} type="button" aria-label={k.aria}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { const [s, e] = sel(); apply(insertAt(value, s, e, k.insert)); }}
                  className="min-h-11 rounded-md border border-[#c5cfe3] bg-white text-lg text-ink hover:border-ink">
                  {k.label}
                </button>
              ))}
              {r === 1 && (
                <button type="button" aria-label="xóa ký tự" onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { const [s, e] = sel(); apply(backspaceAt(value, s, e)); }}
                  className="col-span-1 min-h-11 rounded-md border border-[#c5cfe3] bg-white text-ink hover:border-ink">⌫</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
