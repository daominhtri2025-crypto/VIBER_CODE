"use client";

import { useEffect, useState } from "react";
import { EquationField } from "@/components/EquationField";
import { Button, Empty, ErrorNote, Field, Section, Table, inputCls, useAction } from "@/components/ui";
import { api } from "@/lib/client";

type Prob = { problem_id: string; topic_id: string; mine: number; version: number; statement: string; difficulty: string; approval_status: string };
type Topic = { id: string; name: string; grade: number };
const DIFF: Record<string, string> = { easy: "Dễ", medium: "Trung bình", hard: "Khó" };

/** Split "lhs = rhs" typed with the student keyboard into the math_spec the server validates. */
function splitEquation(eq: string): { lhs: string; rhs: string } | null {
  const parts = eq.split("=");
  return parts.length === 2 && parts[0].trim() && parts[1].trim() ? { lhs: parts[0].trim(), rhs: parts[1].trim() } : null;
}

export default function ProblemBank() {
  const [items, setItems] = useState<Prob[] | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [eq, setEq] = useState("");
  const [f, setF] = useState({ topic_id: "", statement: "", teacher_solution: "", h1: "", h2: "", h3: "", difficulty: "easy" });
  const act = useAction();
  const load = async () => {
    const [p, t] = await Promise.all([api<Prob[]>("problems"), api<Topic[]>("topics")]);
    setItems(p); setTopics(t);
    setF((x) => ({ ...x, topic_id: x.topic_id || t[0]?.id || "" }));
  };
  useEffect(() => { act.run(load); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <>
      <h1 className="mb-2 text-3xl font-semibold">Ngân hàng bài</h1>
      <p className="mb-6 max-w-2xl text-muted">Bài đã duyệt không sửa được nữa; muốn chỉnh thì tạo phiên bản mới. Lời giải và gợi ý nội bộ không bao giờ hiện cho học sinh.</p>
      <ErrorNote error={act.error} />
      <Section title="Danh sách bài">
        {items === null ? <p className="text-muted">Đang tải…</p> : items.length === 0 ? <Empty>Chưa có bài.</Empty> : (
          <Table head={["Đề bài", "Phiên bản", "Độ khó", "Trạng thái", ""]} rows={items.map((p) => [
            p.statement, p.version, DIFF[p.difficulty], p.approval_status === "approved" ? "Đã duyệt" : "Bản nháp",
            p.approval_status === "draft" && p.mine ? (
              <Button key="a" variant="quiet" disabled={act.busy} onClick={() => act.run(async () => {
                await api(`problems/${p.problem_id}/versions/${p.version}/approve`, { method: "POST" }); await load();
              })}>Duyệt</Button>
            ) : null,
          ])} />
        )}
      </Section>
      <Section title="Soạn bài mới">
        <form className="grid gap-3 rounded-lg border border-line bg-white p-4" onSubmit={(e) => {
          e.preventDefault();
          const spec = splitEquation(eq);
          if (!spec) { act.setError(new Error("Phương trình cần đúng một dấu = và có hai vế.")); return; }
          act.run(async () => {
            const { id } = await api<{ id: string }>("problems", { method: "POST", body: { topic_id: f.topic_id } });
            await api(`problems/${id}/versions`, { method: "POST", body: {
              statement: f.statement || `Giải phương trình ${eq}`, teacher_solution: f.teacher_solution, difficulty: f.difficulty,
              math_spec: { variable: "x", domain: "R", ...spec }, hints: [f.h1, f.h2, f.h3],
            } });
            setEq(""); setF({ ...f, statement: "", teacher_solution: "", h1: "", h2: "", h3: "" });
            await load();
          });
        }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Chủ đề">
              <select className={inputCls} value={f.topic_id} onChange={(e) => setF({ ...f, topic_id: e.target.value })}>
                {topics.map((t) => <option key={t.id} value={t.id}>{t.name} (lớp {t.grade})</option>)}
              </select>
            </Field>
            <Field label="Độ khó">
              <select className={inputCls} value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}>
                {Object.entries(DIFF).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </div>
          <EquationField label="Phương trình" value={eq} onChange={setEq} placeholder="vd 5x − 2 = 13" />
          <Field label="Lời đề (để trống sẽ dùng “Giải phương trình …”)"><input className={inputCls} value={f.statement} onChange={(e) => setF({ ...f, statement: e.target.value })} /></Field>
          <Field label="Lời giải nội bộ (chỉ giáo viên thấy)"><textarea className={inputCls} rows={2} value={f.teacher_solution} onChange={(e) => setF({ ...f, teacher_solution: e.target.value })} required /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Gợi ý mức 1 (định hướng)"><textarea className={inputCls} rows={2} value={f.h1} onChange={(e) => setF({ ...f, h1: e.target.value })} required /></Field>
            <Field label="Gợi ý mức 2 (nhắc quy tắc)"><textarea className={inputCls} rows={2} value={f.h2} onChange={(e) => setF({ ...f, h2: e.target.value })} required /></Field>
            <Field label="Gợi ý mức 3 (gợi thao tác, không tính hộ)"><textarea className={inputCls} rows={2} value={f.h3} onChange={(e) => setF({ ...f, h3: e.target.value })} required /></Field>
          </div>
          <p className="text-sm text-muted">Bài mới dùng được ngay cho chế độ luyện tập và tự làm. Chế độ có hướng dẫn cần thêm danh mục kiến thức/hướng giải đã duyệt.</p>
          <Button type="submit" disabled={act.busy} className="justify-self-start">Lưu bản nháp</Button>
        </form>
      </Section>
    </>
  );
}
