"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { EquationField } from "@/components/EquationField";
import { MathText } from "@/components/MathText";
import { Button, ErrorNote, Field, inputCls, useAction } from "@/components/ui";
import { ApiError, api, newRequestId } from "@/lib/client";
import { OPERATIONS } from "@/lib/math-input";
import { MODE_LABEL, OP_LABEL, STATE_STEPS, type TutorReply } from "@/lib/types";

/** Reuse the same request_id while the same payload is being retried; new payload → new id. */
function useRequestId() {
  const ref = useRef<{ key: string; id: string } | null>(null);
  return {
    for(payload: unknown) {
      const key = JSON.stringify(payload);
      if (!ref.current || ref.current.key !== key) ref.current = { key, id: newRequestId() };
      return ref.current.id;
    },
    done() { ref.current = null; },
  };
}

function Stepper({ state, mode }: { state: string; mode: string }) {
  const steps = mode === "guided" ? STATE_STEPS : STATE_STEPS.filter((s) => !["READ_PROBLEM", "IDENTIFY_KNOWLEDGE", "PROPOSE_PLAN"].includes(s.state));
  const current = steps.findIndex((s) => s.state === state);
  const done = state === "COMPLETED";
  return (
    <ol aria-label="Các bước của bài" className="flex flex-wrap gap-x-1 gap-y-2 text-sm">
      {steps.map((s, i) => {
        const status = done || i < current ? "done" : i === current ? "now" : "todo";
        return (
          <li key={s.state} aria-current={status === "now" ? "step" : undefined}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${status === "now" ? "bg-ink text-white" : status === "done" ? "text-ok" : "text-muted"}`}>
            <span aria-hidden className={`grid h-5 w-5 place-items-center rounded-full border text-xs ${status === "now" ? "border-white" : "border-current"}`}>
              {status === "done" ? "✓" : i + 1}
            </span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

function Mark({ status, hidden }: { status?: string; hidden: boolean }) {
  if (hidden || !status) return <span className="w-8" aria-hidden />;
  const m = { valid: ["✓", "text-ok", "Bước đúng"], invalid: ["✗", "text-pen", "Bước chưa đúng"],
    unknown: ["?", "text-hl-ink", "Chưa đọc được"] }[status] ?? ["", "", ""];
  return <span className={`stamp w-8 text-center text-xl font-bold ${m[1]}`} title={m[2]} aria-label={m[2]}>{m[0]}</span>;
}

export default function Workspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [view, setView] = useState<TutorReply | null>(null);
  const [reply, setReply] = useState<TutorReply | null>(null);
  const act = useAction();
  const rid = useRequestId();

  const load = useCallback(async () => setView(await api<TutorReply>(`sessions/${id}`)), [id]);
  useEffect(() => { act.run(load); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [load]);

  async function send(path: string, body: Record<string, unknown>, versioned = true) {
    if (!view) return;
    const payload = versioned ? { ...body, expected_version: view.session_version } : body;
    const request_id = rid.for({ path, ...payload });
    await act.run(async () => {
      try {
        const r = await api<TutorReply>(`sessions/${id}/${path}`, { method: "POST", body: { request_id, ...payload } });
        rid.done();
        // A hint answers "help me" — keep the last step feedback visible next to it.
        setReply((prev) => path === "hints" && prev && prev.state === r.state
          ? { ...prev, hint: r.hint, hint_level: r.hint_level, hint_trigger: r.hint_trigger, needs_teacher: r.needs_teacher || prev.needs_teacher,
              feedback: r.hint ? prev.feedback : r.feedback, session_version: r.session_version }
          : r);
        await load();
      } catch (e) {
        if (e instanceof ApiError && e.code === "VERSION_CONFLICT") { rid.done(); await load(); }
        throw e;
      }
    });
  }

  if (!view) return <><ErrorNote error={act.error} /><p className="text-muted">Đang mở bài…</p></>;
  const independent = modeOf(view) === "independent" && view.state !== "COMPLETED";
  const steps = view.extra.steps ?? [];
  const tutor = reply ?? view;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-6">
      <div className="min-w-0 max-lg:order-1 lg:col-start-1 lg:row-start-1">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Stepper state={view.state} mode={modeOf(view)} />
          <span className="text-sm text-muted">{MODE_LABEL[modeOf(view)]}</span>
        </div>

        <article className="notebook overflow-hidden rounded-xl border border-line pb-6 pl-[72px] pr-4 pt-5" aria-label="Vở nháp">
          <h1 className="mb-4 text-xl font-semibold leading-snug">{view.extra.statement}</h1>
          <ol className="space-y-1" aria-label="Các bước em đã viết">
            {steps.length === 0 && <li className="py-2 text-muted">Các bước giải của em sẽ được ghi vào đây.</li>}
            {steps.map((s) => (
              <li key={s.step_index} className="-ml-[64px] flex min-h-12 items-center gap-2">
                <Mark status={s.math_status} hidden={independent} />
                <span className="w-6 shrink-0 text-right text-sm text-muted">{s.step_index}</span>
                <div className="min-w-0 flex-1">
                  <MathText value={s.operation === "conclude" ? "" : s.submitted_equation} className="ink" />
                  {s.operation === "conclude" && <span className="ink">{s.submitted_equation === "no_solution" ? "Phương trình vô nghiệm" : "Phương trình có vô số nghiệm"}</span>}
                  <span className="ml-3 text-sm text-muted">{OP_LABEL[s.operation] ?? s.operation}{s.operation_value ? ` ${s.operation_value}` : ""}</span>
                  {s.explanation && <p className="text-sm text-muted">{s.explanation}</p>}
                </div>
              </li>
            ))}
          </ol>
        </article>
      </div>

      <div className="min-w-0 rounded-xl border border-line bg-white p-4 max-lg:order-3 lg:col-start-1 lg:row-start-2">
        <ErrorNote error={act.error} />
        <ActionPanel view={view} busy={act.busy} send={send} sessionId={id} />
      </div>

      <aside aria-label="Trợ lý" className="space-y-4 max-lg:order-2 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
        <TutorNote reply={tutor} independent={independent} />
        {!independent && ["IDENTIFY_KNOWLEDGE", "PROPOSE_PLAN", "SOLVE_STEP", "VERIFY_RESULT"].includes(view.state) && (
          <Button variant="quiet" className="w-full" disabled={act.busy}
            onClick={() => send("hints", {}, false)}>Xin gợi ý</Button>
        )}
      </aside>
    </div>
  );
}

function modeOf(v: TutorReply): string {
  return v.extra.learning_mode ?? "guided";
}

function TutorNote({ reply, independent }: { reply: TutorReply; independent: boolean }) {
  const [reported, setReported] = useState(false);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-white p-4" aria-live="polite">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">{reply.ai_generated ? "Trợ lý AI" : "Trợ lý"}</h2>
        {reply.math_status && !independent && (
          <span className={`text-sm ${reply.math_status === "valid" ? "text-ok" : reply.math_status === "invalid" ? "text-pen" : "text-hl-ink"}`}>
            {reply.math_status === "valid" ? "Bước đúng" : reply.math_status === "invalid" ? "Chưa đúng" : "Chưa đọc được"}
          </span>
        )}
      </div>
      {reply.feedback && <p className="mb-2">{reply.feedback}</p>}
      {reply.question && <p className="font-medium text-ink">{reply.question}</p>}
      {reply.hint && (
        <div className="mt-3 rounded-lg bg-hl px-3 py-2 text-hl-ink">
          <p className="text-sm font-medium">Gợi ý mức {reply.hint_level}{reply.hint_trigger === "system_offer" ? " (hệ thống đề xuất)" : ""}</p>
          <p>{reply.hint}</p>
        </div>
      )}
      {reply.needs_teacher && <p className="mt-3 text-sm text-pen">Thầy cô đã được báo để hỗ trợ em ở bước này.</p>}
      {reply.summary && (
        <p className="mt-3">Em đã nộp bài với {reply.summary.steps} bước.{" "}
          {reply.summary.reached_correct_final_form ? "Em đã tìm ra kết quả đúng." : "Bài chưa đi tới kết quả đúng; thầy cô sẽ xem lại cùng em."}</p>
      )}
      {reply.ai_generated && (
        <div className="mt-3 border-t border-line pt-2 text-xs text-muted">
          <p>{reply.ai_disclosure}</p>
          {reply.ai_message_id && !reported && (
            open ? (
              <form className="mt-2 space-y-2" onSubmit={async (e) => {
                e.preventDefault();
                await api("feedback-reports", { method: "POST", body: { message_id: reply.ai_message_id, reason } });
                setReported(true);
              }}>
                <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3}
                  placeholder="Phản hồi này sai hoặc khó hiểu ở đâu?" required />
                <Button variant="quiet" type="submit">Gửi báo lỗi</Button>
              </form>
            ) : <button type="button" className="mt-1 underline" onClick={() => setOpen(true)}>Báo phản hồi chưa đúng</button>
          )}
          {reported && <p className="mt-1">Đã gửi. Thầy cô sẽ xem lại.</p>}
        </div>
      )}
    </div>
  );
}

function ActionPanel({ view, busy, send, sessionId }: {
  view: TutorReply; busy: boolean; sessionId: string;
  send: (path: string, body: Record<string, unknown>, versioned?: boolean) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [choice, setChoice] = useState("");
  const [eq, setEq] = useState("");
  const [op, setOp] = useState(OPERATIONS[0].value);
  const [opValue, setOpValue] = useState("");
  const [explain, setExplain] = useState("");
  const [childBusy, setChildBusy] = useState(false);
  const [noChild, setNoChild] = useState(false);
  const opMeta = OPERATIONS.find((o) => o.value === op)!;
  const mode = view.extra.learning_mode;

  useEffect(() => { setChoice(""); }, [view.state]);

  switch (view.state) {
    case "READ_PROBLEM":
      return (
        <form onSubmit={(e) => { e.preventDefault(); send("read", { restatement: text }); }} className="space-y-3">
          <Field label={view.question}><textarea className={inputCls} rows={2} value={text} onChange={(e) => setText(e.target.value)} required /></Field>
          <Button type="submit" disabled={busy}>Gửi</Button>
        </form>
      );
    case "IDENTIFY_KNOWLEDGE":
    case "PROPOSE_PLAN":
      return (
        <form onSubmit={(e) => { e.preventDefault(); send(view.state === "IDENTIFY_KNOWLEDGE" ? "knowledge" : "plan", { option_id: choice, explanation: explain }); }}
          className="space-y-3">
          <fieldset>
            <legend className="mb-2 font-medium">{view.question}</legend>
            <div className="grid gap-2">
              {(view.options ?? []).map((o) => (
                <label key={o.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${choice === o.id ? "border-ink bg-[#eef2fb]" : "border-line"}`}>
                  <input type="radio" name="opt" value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Vì sao em chọn như vậy? (không bắt buộc)">
            <input className={inputCls} value={explain} onChange={(e) => setExplain(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy || !choice}>Gửi lựa chọn</Button>
        </form>
      );
    case "SOLVE_STEP":
      return (
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          await send("steps", { submitted_equation: eq, operation: op, operation_value: opMeta.needsValue ? opValue : null, explanation: explain });
        }}>
          <EquationField label="Phương trình sau khi biến đổi" value={eq} onChange={setEq} placeholder="vd 2x = 12" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Em đã làm gì?">
              <select className={inputCls} value={op} onChange={(e) => setOp(e.target.value)}>
                {OPERATIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            {opMeta.needsValue && (
              <Field label="Với số / hạng tử">
                <input className={`${inputCls} ink`} value={opValue} onChange={(e) => setOpValue(e.target.value)} placeholder={opMeta.placeholder} required />
              </Field>
            )}
          </div>
          <Field label="Giải thích ngắn (em làm vậy vì sao?)">
            <input className={inputCls} value={explain} onChange={(e) => setExplain(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || !eq.trim()}>Ghi bước này</Button>
            {mode === "independent" && (
              <Button type="button" variant="quiet" disabled={busy}
                onClick={() => send("submit", {}, true)}>Nộp bài</Button>
            )}
          </div>
        </form>
      );
    case "VERIFY_RESULT":
      return view.extra.verify_mode === "conclusion" ? (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); send("verify", { conclusion: choice }); }}>
          <fieldset>
            <legend className="mb-2 font-medium">{view.question}</legend>
            {[["no_solution", "Phương trình vô nghiệm"], ["infinite_solutions", "Phương trình có vô số nghiệm"]].map(([v, l]) => (
              <label key={v} className="mb-2 flex min-h-11 items-center gap-3 rounded-lg border border-line px-3">
                <input type="radio" name="c" value={v} checked={choice === v} onChange={() => setChoice(v)} />{l}
              </label>
            ))}
          </fieldset>
          <Button type="submit" disabled={busy || !choice}>Gửi kết luận</Button>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); send("verify", { substitution: eq }); }}>
          <EquationField label="Thay giá trị em tìm được vào phương trình ban đầu" value={eq} onChange={setEq} placeholder="vd 2×6 + 5 = 17" />
          <Button type="submit" disabled={busy || !eq.trim()}>Kiểm tra</Button>
        </form>
      );
    case "INDEPENDENT_PRACTICE":
      return (
        <div className="space-y-3">
          <p>Em đã giải và kiểm tra xong. Giờ em tự làm một bài tương tự, không có gợi ý.</p>
          {view.extra.child_session_id ? (
            <Link className="inline-block rounded-lg bg-ink px-4 py-2 text-white" href={`/hoc/phien/${view.extra.child_session_id}`}>Làm bài tương tự</Link>
          ) : (
            <Button disabled={childBusy} onClick={async () => {
              setChildBusy(true);
              const r = await api<{ next_session_id: string | null }>(`sessions/${sessionId}/independent`, { method: "POST" });
              setChildBusy(false);
              if (r.next_session_id) window.location.href = `/hoc/phien/${r.next_session_id}`;
              else setNoChild(true);
            }}>Mở bài tương tự</Button>
          )}
          {noChild && <p className="text-muted">Chưa có bài tương tự cho em. Thầy cô sẽ bổ sung bài mới.</p>}
        </div>
      );
    default:
      return (
        <div className="space-y-2">
          <p className="font-medium text-ok">Em đã hoàn thành bài này.</p>
          <Link href="/hoc" className="text-ink underline">Về danh sách bài</Link>
        </div>
      );
  }
}
