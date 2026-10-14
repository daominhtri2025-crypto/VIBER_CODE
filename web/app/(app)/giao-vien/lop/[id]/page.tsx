"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Button, Empty, ErrorNote, Field, Section, Table, inputCls, useAction } from "@/components/ui";
import { api } from "@/lib/client";
import { MODE_LABEL, fmtDate } from "@/lib/types";

type Member = { id: string; display_name: string; status: string };
type Report = {
  sessions: { id: string; display_name: string; problem_id: string; learning_mode: string; state: string; step_count: number;
    invalid_step_count: number; requested_hint_count: number; total_hint_count: number; max_hint_level: number | null; active_minutes: number }[];
  needs_teacher: Record<string, number>;
  errors: { math_status: string; error_code: string | null; occurrences: number }[];
};
type Prob = { problem_id: string; version: number; statement: string; difficulty: string; approval_status: string };
type Asg = { id: string; title: string; learning_mode: string; due_at: string | null };

const ERR_VI: Record<string, string> = { SIGN_ERROR: "Sai dấu", ARITHMETIC_ERROR: "Tính toán sai", OPERATION_MISMATCH: "Không khớp thao tác",
  NON_EQUIVALENT: "Không tương đương", DIVISION_BY_ZERO: "Chia cho 0", PARSE_UNKNOWN: "Không đọc được", OUT_OF_SCOPE: "Ngoài phạm vi" };

export default function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [members, setMembers] = useState<Member[]>([]);
  const [directory, setDirectory] = useState<{ id: string; display_name: string }[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [assignments, setAssignments] = useState<Asg[]>([]);
  const [bank, setBank] = useState<Prob[]>([]);
  const [pick, setPick] = useState("");
  const [form, setForm] = useState({ title: "", learning_mode: "guided", due_at: "", problems: [] as string[] });
  const act = useAction();

  const load = async () => {
    const [m, r, a, b, d] = await Promise.all([api<Member[]>(`classes/${id}/members`), api<Report>(`classes/${id}/report`),
      api<Asg[]>(`classes/${id}/assignments`), api<Prob[]>("problems"), api<{ id: string; display_name: string }[]>("directory/students")]);
    setMembers(m); setReport(r); setAssignments(a); setBank(b.filter((p) => p.approval_status === "approved")); setDirectory(d);
  };
  useEffect(() => { act.run(load); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const notMember = directory.filter((d) => !members.some((m) => m.id === d.id));

  return (
    <>
      <h1 className="mb-6 text-3xl font-semibold">Theo dõi lớp</h1>
      <ErrorNote error={act.error} />

      <Section title="Tiến trình làm bài">
        {!report || report.sessions.length === 0 ? <Empty>Chưa có học sinh nào làm bài.</Empty> : (
          <Table head={["Học sinh", "Bài", "Chế độ", "Trạng thái", "Số lần thử", "Bước sai", "Gợi ý xin / tổng", "Mức cao nhất", "Thời gian học", ""]}
            rows={report.sessions.map((s) => [
              <span key="n">{s.display_name}{report.needs_teacher[s.id] ? <span className="ml-2 rounded bg-pen/10 px-1.5 text-xs text-pen">cần hỗ trợ</span> : null}</span>,
              s.problem_id, MODE_LABEL[s.learning_mode], s.state === "COMPLETED" ? "Xong" : s.state, s.step_count, s.invalid_step_count,
              `${s.requested_hint_count} / ${s.total_hint_count}`, s.max_hint_level ?? "—", `${s.active_minutes} phút`,
              <Link key="l" href={`/giao-vien/phien/${s.id}`} className="text-ink underline">Xem từng bước</Link>,
            ])} />
        )}
        {report && report.errors.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 font-medium">Lỗi thường gặp</h3>
            <ul className="flex flex-wrap gap-2">
              {report.errors.map((e) => (
                <li key={`${e.math_status}-${e.error_code}`} className="rounded-md border border-line bg-white px-3 py-1 text-sm">
                  {e.error_code ? ERR_VI[e.error_code] ?? e.error_code : "Không mã"}: <strong>{e.occurrences}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Bài đã giao">
        {assignments.length === 0 ? <Empty>Chưa giao bài nào.</Empty> : (
          <Table head={["Tiêu đề", "Chế độ", "Hạn"]} rows={assignments.map((a) => [a.title, MODE_LABEL[a.learning_mode], fmtDate(a.due_at)])} />
        )}
        <form className="mt-4 grid gap-3 rounded-lg border border-line bg-white p-4" onSubmit={(e) => {
          e.preventDefault();
          act.run(async () => {
            await api("assignments", { method: "POST", body: {
              class_id: id, title: form.title, learning_mode: form.learning_mode,
              due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
              problems: form.problems.map((k) => { const [p, v] = k.split("@"); return { problem_id: p, problem_version: Number(v) }; }),
            } });
            setForm({ title: "", learning_mode: "guided", due_at: "", problems: [] });
            await load();
          });
        }}>
          <h3 className="font-medium">Giao bài mới</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tiêu đề"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
            <Field label="Chế độ" hint="Có hướng dẫn: đủ 5 bước gợi mở. Tự làm: không gợi ý.">
              <select className={inputCls} value={form.learning_mode} onChange={(e) => setForm({ ...form, learning_mode: e.target.value })}>
                {Object.entries(MODE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Hạn nộp (không bắt buộc)"><input type="datetime-local" className={inputCls} value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Chọn bài đã duyệt</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {bank.map((p) => {
                const key = `${p.problem_id}@${p.version}`;
                return (
                  <label key={key} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
                    <input type="checkbox" checked={form.problems.includes(key)} onChange={(e) => setForm({ ...form,
                      problems: e.target.checked ? [...form.problems, key] : form.problems.filter((x) => x !== key) })} />
                    <span>{p.statement} <span className="text-xs text-muted">({p.difficulty})</span></span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <Button type="submit" disabled={act.busy || form.problems.length === 0} className="justify-self-start">Giao bài</Button>
        </form>
      </Section>

      <Section title={`Học sinh (${members.length})`}>
        <ul className="mb-3 flex flex-wrap gap-2">{members.map((m) => <li key={m.id} className="rounded-md border border-line bg-white px-3 py-1">{m.display_name}</li>)}</ul>
        <form className="flex max-w-xl flex-wrap items-end gap-3" onSubmit={(e) => {
          e.preventDefault();
          act.run(async () => { await api(`classes/${id}/members`, { method: "POST", body: { student_id: pick } }); setPick(""); await load(); });
        }}>
          <Field label="Thêm học sinh vào lớp">
            <select className={inputCls} value={pick} onChange={(e) => setPick(e.target.value)} required>
              <option value="">Chọn học sinh</option>
              {notMember.map((d) => <option key={d.id} value={d.id}>{d.display_name}</option>)}
            </select>
          </Field>
          <Button type="submit" variant="quiet" disabled={act.busy || !pick}>Thêm</Button>
        </form>
        <p className="mt-2 text-sm text-muted">Chưa có tài khoản? Tạo tài khoản học sinh ở <Link className="underline" href="/giao-vien/tai-khoan">trang tài khoản</Link>.</p>
      </Section>
    </>
  );
}
