"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { EquationField } from "@/components/EquationField";
import { Button, ErrorNote, Field, inputCls, useAction } from "@/components/ui";
import { ApiError, api } from "@/lib/client";

type Item = { item_id: string; position: number; statement: string; max_solution_score: number;
  max_explanation_score: number; solution: string | null; explanation: string | null };
type Result = { total_score: number | null; graded_items: number; expected_items: number;
  items: { position: number; solution_score: number | null; explanation_score: number | null;
    max_solution_score: number; max_explanation_score: number }[] };

/**
 * Independent assessment: no AI, no hints, no right/wrong while working (handoff §5.5).
 * Answers autosave as drafts; submitting freezes them.
 */
export default function AssessmentAttempt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<Record<string, { solution: string; explanation: string }>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<Result | null | "pending">(null);
  const act = useAction();

  useEffect(() => {
    act.run(async () => {
      const status = await api<{ submitted_at: string | null }>(`attempts/${id}`);
      if (status.submitted_at) setSubmitted(true);
      const list = await api<Item[]>(`attempts/${id}/items`);
      setItems(list);
      setDraft(Object.fromEntries(list.map((i) => [i.item_id, { solution: i.solution ?? "", explanation: i.explanation ?? "" }])));
      try {
        if (status.submitted_at) setResult(await api<Result>(`attempts/${id}/result`));
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setResult(null); else throw e;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = (itemId: string) => act.run(async () => {
    await api(`attempts/${id}/items/${itemId}`, { method: "PUT", body: draft[itemId] });
    setSaved((s) => ({ ...s, [itemId]: true }));
  });

  if (result && result !== "pending") {
    return (
      <div className="max-w-2xl">
        <h1 className="mb-4 text-2xl font-semibold">Kết quả bài kiểm tra</h1>
        <p className="mb-4 text-lg">Tổng điểm: <strong>{result.total_score ?? "chưa chấm xong"}</strong></p>
        <ul className="divide-y divide-line rounded-lg border border-line bg-white">
          {result.items.map((r) => (
            <li key={r.position} className="px-4 py-3">Câu {r.position}: lời giải {r.solution_score ?? "—"}/{r.max_solution_score},
              giải thích {r.explanation_score ?? "—"}/{r.max_explanation_score}</li>
          ))}
        </ul>
        <Link href="/hoc" className="mt-4 inline-block text-ink underline">Về trang bài của em</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-semibold">Bài kiểm tra</h1>
      <p className="mb-6 text-muted">Em tự làm, không có gợi ý. Bài được lưu nháp sau mỗi câu; khi nộp sẽ không sửa được nữa.</p>
      <ErrorNote error={act.error} />
      {submitted ? (
        <p className="rounded-lg border border-line bg-white px-4 py-6">Em đã nộp bài. Kết quả sẽ hiện khi thầy cô công bố.</p>
      ) : (
        <>
          {items.map((it) => (
            <section key={it.item_id} className="notebook mb-6 rounded-xl border border-line py-5 pl-[72px] pr-4">
              <h2 className="mb-3 font-semibold">Câu {it.position}. {it.statement}</h2>
              <div className="space-y-3">
                <EquationField label="Lời giải (các bước, viết cách nhau bằng dấu ;)" value={draft[it.item_id]?.solution ?? ""}
                  onChange={(v) => { setDraft((d) => ({ ...d, [it.item_id]: { ...d[it.item_id], solution: v } })); setSaved((s) => ({ ...s, [it.item_id]: false })); }} />
                <Field label="Giải thích">
                  <textarea className={inputCls} rows={3} value={draft[it.item_id]?.explanation ?? ""}
                    onChange={(e) => { setDraft((d) => ({ ...d, [it.item_id]: { ...d[it.item_id], explanation: e.target.value } })); setSaved((s) => ({ ...s, [it.item_id]: false })); }} />
                </Field>
                <div className="flex items-center gap-3">
                  <Button variant="quiet" type="button" disabled={act.busy} onClick={() => save(it.item_id)}>Lưu nháp câu {it.position}</Button>
                  {saved[it.item_id] && <span className="text-sm text-ok">Đã lưu</span>}
                </div>
              </div>
            </section>
          ))}
          <Button disabled={act.busy || items.length === 0} onClick={() => act.run(async () => {
            for (const it of items) await api(`attempts/${id}/items/${it.item_id}`, { method: "PUT", body: draft[it.item_id] });
            await api(`attempts/${id}/submit`, { method: "POST" });
            setSubmitted(true);
            setResult("pending");
          })}>Nộp bài</Button>
        </>
      )}
    </div>
  );
}
