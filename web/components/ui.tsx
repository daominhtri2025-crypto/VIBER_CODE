"use client";

import { useState } from "react";

export function Button({ variant = "primary", className = "", ...p }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "danger" }) {
  const look = {
    primary: "bg-ink text-white hover:bg-[#182e78] disabled:bg-[#9aa8cf]",
    quiet: "bg-white text-ink border border-[#c5cfe3] hover:border-ink disabled:text-muted",
    danger: "bg-white text-pen border border-pen/40 hover:border-pen",
  }[variant];
  return <button {...p} className={`min-h-11 rounded-lg px-4 py-2 font-medium transition-colors ${look} ${className}`} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full min-h-11 rounded-lg border border-[#c5cfe3] bg-white px-3 py-2 text-base focus:border-ink";

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="rounded-lg border border-pen/30 bg-white px-3 py-2 text-pen">{String((error as Error).message ?? error)}</p>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-[#c5cfe3] px-4 py-6 text-center text-muted">{children}</p>;
}

/** Runs an async action with busy/error state; keeps the error visible until the next try. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try { return await fn(); } catch (e) { setError(e); return undefined; } finally { setBusy(false); }
  }
  return { busy, error, run, setError };
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-[#f6f8fb] text-muted">
          <tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {r.map((c, j) => <td key={j} className="px-3 py-2 align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
