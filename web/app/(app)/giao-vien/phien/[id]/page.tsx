"use client";

import { use, useEffect, useState } from "react";
import { MathText } from "@/components/MathText";
import { ErrorNote, Section, useAction } from "@/components/ui";
import { api } from "@/lib/client";
import { OP_LABEL, fmtDate } from "@/lib/types";

type Detail = {
  session: { id: string; student_id: string; problem_id: string; learning_mode: string; state: string; started_at: string };
  steps: { step_index: number; submitted_equation: string; previous_equation: string; operation: string; operation_value: string | null;
    explanation: string; math_status: string; error_code: string | null; created_at: string }[];
  messages: { id: string; sender_type: string; text: string; meta: Record<string, unknown>; created_at: string }[];
};

const KIND_VI: Record<string, string> = { attempt: "Phản hồi", feedback: "Phản hồi", hint: "Gợi ý", ai_feedback: "AI", flag: "Cần hỗ trợ" };

/** Teacher view of the full process: every attempt (including wrong ones), hints and tutor turns. */
export default function TeacherSession({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const act = useAction();
  useEffect(() => { act.run(async () => setD(await api<Detail>(`teacher/sessions/${id}`))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  if (!d) return <><ErrorNote error={act.error} /><p className="text-muted">Đang tải…</p></>;
  return (
    <>
      <h1 className="mb-1 text-3xl font-semibold">Quá trình làm bài</h1>
      <p className="mb-6 text-muted">Bài {d.session.problem_id}, bắt đầu {fmtDate(d.session.started_at)}, trạng thái {d.session.state}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Các lần thử">
          <ol className="notebook rounded-xl border border-line py-3 pl-[72px] pr-4">
            {d.steps.map((s) => (
              <li key={s.step_index} className="-ml-[64px] flex min-h-12 items-start gap-2 py-1">
                <span className={`w-8 text-center text-xl font-bold ${s.math_status === "valid" ? "text-ok" : s.math_status === "invalid" ? "text-pen" : "text-hl-ink"}`}>
                  {s.math_status === "valid" ? "✓" : s.math_status === "invalid" ? "✗" : "?"}
                </span>
                <div>
                  <MathText value={s.submitted_equation} className="ink" />
                  <span className="ml-2 text-sm text-muted">{OP_LABEL[s.operation] ?? s.operation} {s.operation_value ?? ""}</span>
                  {s.error_code && <span className="ml-2 text-sm text-pen">{s.error_code}</span>}
                  {s.explanation && <p className="text-sm">“{s.explanation}”</p>}
                </div>
              </li>
            ))}
          </ol>
        </Section>
        <Section title="Đối thoại và gợi ý">
          <ul className="space-y-2">
            {d.messages.filter((m) => m.text).map((m) => (
              <li key={m.id} className={`rounded-lg border px-3 py-2 ${m.sender_type === "student" ? "border-[#c5cfe3] bg-white" : m.meta.kind === "flag" ? "border-pen/40 bg-pen/5" : m.meta.kind === "hint" ? "border-transparent bg-hl" : "border-line bg-[#f6f8fb]"}`}>
                <span className="text-xs text-muted">{m.sender_type === "student" ? "Học sinh" : KIND_VI[String(m.meta.kind)] ?? m.sender_type}</span>
                <p>{m.text}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
