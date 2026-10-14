"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MathText } from "@/components/MathText";
import { Button, Empty, ErrorNote, Section, useAction } from "@/components/ui";
import { api } from "@/lib/client";
import { MODE_LABEL, fmtDate, type Assignment } from "@/lib/types";

type Hist = { id: string; learning_mode: string; state: string; statement: string; step_count: number;
  invalid_step_count: number; requested_hint_count: number; started_at: string; assignment_id: string | null };
type Asm = { id: string; title: string; phase: string; opens_at: string | null; closes_at: string | null;
  results_published_at: string | null; attempt_id: string | null; submitted_at: string | null };

const PHASE = { pre: "Kiểm tra đầu kỳ", post: "Kiểm tra cuối kỳ", retention: "Kiểm tra lại" } as Record<string, string>;
const STATE_VI: Record<string, string> = { COMPLETED: "Đã xong", INDEPENDENT_PRACTICE: "Chờ tự luyện" };

export default function StudentHome() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [history, setHistory] = useState<Hist[]>([]);
  const [tests, setTests] = useState<Asm[]>([]);
  const act = useAction();

  useEffect(() => {
    act.run(async () => {
      const [a, h, t] = await Promise.all([api<Assignment[]>("assignments"), api<Hist[]>("my/sessions"), api<Asm[]>("my/assessments")]);
      setAssignments(a); setHistory(h); setTests(t);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = (assignmentId: string, problemId: string, version: number) => act.run(async () => {
    const r = await api<{ session_id: string }>("sessions", { method: "POST",
      body: { assignment_id: assignmentId, problem_id: problemId, problem_version: version } });
    router.push(`/hoc/phien/${r.session_id}`);
  });
  const startTest = (id: string) => act.run(async () => {
    const r = await api<{ id: string }>(`assessments/${id}/attempts`, { method: "POST" });
    router.push(`/hoc/kiem-tra/${r.id}`);
  });

  return (
    <>
      <h1 className="mb-6 text-3xl font-semibold">Bài của em</h1>
      <ErrorNote error={act.error} />
      <Section title="Bài được giao">
        {assignments === null ? <p className="text-muted">Đang tải…</p> : assignments.length === 0 ? (
          <Empty>Chưa có bài nào được giao. Khi thầy cô giao bài, bài sẽ hiện ở đây.</Empty>
        ) : assignments.map((a) => (
          <div key={a.id} className="mb-4 rounded-lg border border-line bg-white">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <h3 className="font-semibold">{a.title}</h3>
              <span className="text-sm text-muted">{MODE_LABEL[a.learning_mode]}{a.due_at ? `, hạn ${fmtDate(a.due_at)}` : ""}</span>
            </div>
            <ol className="divide-y divide-line">
              {a.problems.map((p) => (
                <li key={p.problem_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span><span className="mr-2 text-muted">Bài {p.position}.</span>{p.statement}</span>
                  <Button variant="quiet" disabled={act.busy} onClick={() => open(a.id, p.problem_id, p.version)}>Làm bài</Button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </Section>

      {tests.length > 0 && (
        <Section title="Bài kiểm tra">
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {tests.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span>{t.title} <span className="text-sm text-muted">({PHASE[t.phase] ?? t.phase})</span></span>
                {t.submitted_at ? (
                  t.results_published_at
                    ? <Link className="text-ink underline" href={`/hoc/kiem-tra/${t.attempt_id}`}>Xem kết quả</Link>
                    : <span className="text-sm text-muted">Đã nộp, chờ công bố kết quả</span>
                ) : <Button variant="quiet" disabled={act.busy} onClick={() => startTest(t.id)}>{t.attempt_id ? "Làm tiếp" : "Bắt đầu"}</Button>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Bài đã làm">
        {history.length === 0 ? <Empty>Em chưa làm bài nào.</Empty> : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <Link href={`/hoc/phien/${h.id}`} className="text-ink underline-offset-2 hover:underline">
                  <MathText value={h.statement.replace(/^Giải phương trình\s*/i, "")} />
                </Link>
                <span className="text-sm text-muted">
                  {STATE_VI[h.state] ?? "Đang làm"}, {h.step_count} bước, {h.requested_hint_count} gợi ý, {fmtDate(h.started_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
