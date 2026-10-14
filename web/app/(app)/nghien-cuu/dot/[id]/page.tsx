"use client";

import { use, useEffect, useState } from "react";
import { Button, Empty, ErrorNote, Field, Section, Table, inputCls, useAction } from "@/components/ui";
import { api } from "@/lib/client";
import { fmtDate } from "@/lib/types";

type Detail = {
  study: { id: string; title: string };
  groups: { id: string; name: string; condition: string }[];
  participants: { id: string; participant_code: string; group_id: string; display_name: string }[];
  assessments: { id: string; title: string; phase: string; rubric_version: string; opens_at: string | null; closes_at: string | null;
    results_published_at: string | null; items: number }[];
};
type Resp = { response_id: string; participant_code: string; phase: string; position: number; statement: string; solution: string;
  explanation: string; max_solution_score: number; max_explanation_score: number };
type Prob = { problem_id: string; version: number; statement: string; approval_status: string };
const COND: Record<string, string> = { ai_guided: "Có trợ lý AI", comparison: "Đối chứng" };
const PHASE: Record<string, string> = { pre: "Trước", post: "Sau", retention: "Duy trì" };

export default function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [queue, setQueue] = useState<Resp[]>([]);
  const [students, setStudents] = useState<{ id: string; display_name: string }[]>([]);
  const [bank, setBank] = useState<Prob[]>([]);
  const [group, setGroup] = useState({ name: "", condition: "ai_guided" });
  const [part, setPart] = useState({ student_id: "", group_id: "" });
  const [asm, setAsm] = useState({ title: "", phase: "pre", opens_at: "", closes_at: "", items: [] as string[] });
  const [scores, setScores] = useState<Record<string, { s: string; e: string }>>({});
  const [erase, setErase] = useState({ subject_user_id: "", reason: "" });
  const act = useAction();

  const load = async () => {
    const [detail, q, st, b] = await Promise.all([api<Detail>(`studies/${id}`), api<Resp[]>(`studies/${id}/responses`),
      api<{ id: string; display_name: string }[]>("directory/students"), api<Prob[]>("problems")]);
    setD(detail); setQueue(q); setStudents(st); setBank(b.filter((p) => p.approval_status === "approved"));
  };
  useEffect(() => { act.run(load); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  if (!d) return <><ErrorNote error={act.error} /><p className="text-muted">Đang tải…</p></>;
  const enrolled = new Set(d.participants.map((p) => p.display_name));

  return (
    <>
      <h1 className="mb-6 text-3xl font-semibold">{d.study.title}</h1>
      <ErrorNote error={act.error} />

      <Section title="Nhóm và người tham gia">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            {d.groups.length === 0 ? <Empty>Chưa có nhóm.</Empty> : (
              <Table head={["Nhóm", "Điều kiện", "Số người"]} rows={d.groups.map((g) => [g.name, COND[g.condition],
                d.participants.filter((p) => p.group_id === g.id).length])} />
            )}
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act.run(async () => {
              await api(`studies/${id}/groups`, { method: "POST", body: group }); setGroup({ ...group, name: "" }); await load(); }); }}>
              <Field label="Tên nhóm"><input className={inputCls} value={group.name} onChange={(e) => setGroup({ ...group, name: e.target.value })} required /></Field>
              <Field label="Điều kiện">
                <select className={inputCls} value={group.condition} onChange={(e) => setGroup({ ...group, condition: e.target.value })}>
                  {Object.entries(COND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Button variant="quiet" type="submit" disabled={act.busy}>Thêm nhóm</Button>
            </form>
          </div>
          <div>
            {d.participants.length === 0 ? <Empty>Chưa có người tham gia.</Empty> : (
              <Table head={["Mã", "Học sinh", "Nhóm"]} rows={d.participants.map((p) => [<strong key="c">{p.participant_code}</strong>, p.display_name,
                d.groups.find((g) => g.id === p.group_id)?.name ?? ""])} />
            )}
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act.run(async () => {
              await api(`studies/${id}/participants`, { method: "POST", body: part }); setPart({ ...part, student_id: "" }); await load(); }); }}>
              <Field label="Học sinh">
                <select className={inputCls} value={part.student_id} onChange={(e) => setPart({ ...part, student_id: e.target.value })} required>
                  <option value="">Chọn</option>
                  {students.filter((s) => !enrolled.has(s.display_name)).map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                </select>
              </Field>
              <Field label="Vào nhóm">
                <select className={inputCls} value={part.group_id} onChange={(e) => setPart({ ...part, group_id: e.target.value })} required>
                  <option value="">Chọn</option>
                  {d.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Field>
              <Button variant="quiet" type="submit" disabled={act.busy}>Thêm</Button>
            </form>
          </div>
        </div>
      </Section>

      <Section title="Bài kiểm tra trước/sau">
        {d.assessments.length > 0 && (
          <Table head={["Tên", "Giai đoạn", "Rubric", "Câu", "Mở", "Đóng", "Kết quả"]} rows={d.assessments.map((a) => [a.title, PHASE[a.phase], a.rubric_version,
            a.items, fmtDate(a.opens_at), fmtDate(a.closes_at), a.results_published_at ? `Đã công bố ${fmtDate(a.results_published_at)}` : (
              <Button key="p" variant="quiet" disabled={act.busy} onClick={() => act.run(async () => {
                await api(`assessments/${a.id}/publish`, { method: "POST" }); await load(); })}>Công bố kết quả</Button>)])} />
        )}
        <form className="mt-3 grid gap-3 rounded-lg border border-line bg-white p-4" onSubmit={(e) => { e.preventDefault(); act.run(async () => {
          await api(`studies/${id}/assessments`, { method: "POST", body: {
            title: asm.title, phase: asm.phase, rubric_version: "rubric-v1",
            opens_at: asm.opens_at ? new Date(asm.opens_at).toISOString() : null, closes_at: asm.closes_at ? new Date(asm.closes_at).toISOString() : null,
            items: asm.items.map((k) => { const [p, v] = k.split("@"); return { problem_id: p, problem_version: Number(v), max_solution_score: 7, max_explanation_score: 3 }; }),
          } });
          setAsm({ title: "", phase: "pre", opens_at: "", closes_at: "", items: [] }); await load(); }); }}>
          <h3 className="font-medium">Tạo bài kiểm tra (mỗi câu: lời giải 7 điểm, giải thích 3 điểm theo rubric-v1)</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Tên"><input className={inputCls} value={asm.title} onChange={(e) => setAsm({ ...asm, title: e.target.value })} required /></Field>
            <Field label="Giai đoạn"><select className={inputCls} value={asm.phase} onChange={(e) => setAsm({ ...asm, phase: e.target.value })}>
              {Object.entries(PHASE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Mở lúc"><input type="datetime-local" className={inputCls} value={asm.opens_at} onChange={(e) => setAsm({ ...asm, opens_at: e.target.value })} /></Field>
            <Field label="Đóng lúc"><input type="datetime-local" className={inputCls} value={asm.closes_at} onChange={(e) => setAsm({ ...asm, closes_at: e.target.value })} /></Field>
          </div>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium">Câu hỏi (bài đã duyệt)</legend>
            {bank.map((p) => { const k = `${p.problem_id}@${p.version}`; return (
              <label key={k} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
                <input type="checkbox" checked={asm.items.includes(k)} onChange={(e) => setAsm({ ...asm, items: e.target.checked ? [...asm.items, k] : asm.items.filter((x) => x !== k) })} />
                {p.statement}
              </label>); })}
          </fieldset>
          <Button type="submit" className="justify-self-start" disabled={act.busy || asm.items.length === 0}>Tạo bài kiểm tra</Button>
        </form>
      </Section>

      <Section title={`Chấm bài (${queue.length} câu chờ chấm)`}>
        <p className="mb-3 text-sm text-muted">Chấm mù: chỉ hiện mã tham gia, không hiện nhóm. Điểm chỉ tính khi bài đã nộp và chấm đủ mọi câu.</p>
        {queue.length === 0 ? <Empty>Không có câu nào chờ chấm.</Empty> : (
          <ul className="space-y-3">
            {queue.map((r) => (
              <li key={r.response_id} className="rounded-lg border border-line bg-white p-4">
                <p className="text-sm text-muted">{r.participant_code}, kiểm tra {PHASE[r.phase]}, câu {r.position}: {r.statement}</p>
                <p className="ink my-1 whitespace-pre-wrap">{r.solution || "(để trống)"}</p>
                {r.explanation && <p className="mb-2 text-sm">Giải thích: {r.explanation}</p>}
                <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act.run(async () => {
                  const v = scores[r.response_id];
                  await api(`responses/${r.response_id}/grade`, { method: "PATCH", body: { solution_score: Number(v.s), explanation_score: Number(v.e) } });
                  await load(); }); }}>
                  <Field label={`Lời giải (tối đa ${r.max_solution_score})`}><input className={`${inputCls} w-28`} type="number" step="0.25" min={0} max={r.max_solution_score} required
                    value={scores[r.response_id]?.s ?? ""} onChange={(e) => setScores({ ...scores, [r.response_id]: { s: e.target.value, e: scores[r.response_id]?.e ?? "" } })} /></Field>
                  <Field label={`Giải thích (tối đa ${r.max_explanation_score})`}><input className={`${inputCls} w-28`} type="number" step="0.25" min={0} max={r.max_explanation_score} required
                    value={scores[r.response_id]?.e ?? ""} onChange={(e) => setScores({ ...scores, [r.response_id]: { s: scores[r.response_id]?.s ?? "", e: e.target.value } })} /></Field>
                  <Button type="submit" variant="quiet" disabled={act.busy}>Lưu điểm</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Xuất dữ liệu">
        <p className="mb-3 text-sm text-muted">File CSV chỉ có mã tham gia, không có tên hay tài khoản. Ô điểm trống nghĩa là chưa chấm đủ, không phải 0 điểm.</p>
        <div className="flex flex-wrap gap-3">
          <a className="rounded-lg border border-[#c5cfe3] bg-white px-4 py-2 text-ink" href={`/bff/api/studies/${id}/export`}>Tải kết quả kiểm tra (CSV)</a>
          <a className="rounded-lg border border-[#c5cfe3] bg-white px-4 py-2 text-ink" href={`/bff/api/studies/${id}/export/process`}>Tải dữ liệu quá trình học (CSV)</a>
        </div>
      </Section>

      <Section title="Yêu cầu xóa dữ liệu của một học sinh">
        <p className="mb-3 max-w-2xl text-sm text-muted">Dùng khi phụ huynh rút đồng ý. Yêu cầu cần một quản trị viên khác duyệt rồi mới thực hiện; dữ liệu trong bản sao lưu cũ sẽ hết sau tối đa 30 ngày.</p>
        <form className="flex max-w-3xl flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); act.run(async () => {
          await api("erasure-requests", { method: "POST", body: erase }); setErase({ subject_user_id: "", reason: "" }); }); }}>
          <Field label="Học sinh">
            <select className={inputCls} value={erase.subject_user_id} onChange={(e) => setErase({ ...erase, subject_user_id: e.target.value })} required>
              <option value="">Chọn</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
            </select>
          </Field>
          <Field label="Lý do"><input className={`${inputCls} min-w-64`} value={erase.reason} minLength={5} onChange={(e) => setErase({ ...erase, reason: e.target.value })} required /></Field>
          <Button type="submit" variant="danger" disabled={act.busy}>Gửi yêu cầu xóa</Button>
        </form>
      </Section>
    </>
  );
}
