"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Empty, ErrorNote, Field, Section, Table, inputCls, useAction } from "@/components/ui";
import { api } from "@/lib/client";
import { fmtDate } from "@/lib/types";

type Study = { id: string; title: string; start_at: string | null; end_at: string | null };

export default function ResearchHome() {
  const [studies, setStudies] = useState<Study[] | null>(null);
  const [f, setF] = useState({ title: "", start_at: "", end_at: "" });
  const act = useAction();
  const load = async () => setStudies(await api<Study[]>("studies"));
  useEffect(() => { act.run(load); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
    <>
      <h1 className="mb-6 text-3xl font-semibold">Đợt thực nghiệm</h1>
      <ErrorNote error={act.error} />
      <Section title="Đợt em được phân công">
        {studies === null ? <p className="text-muted">Đang tải…</p> : studies.length === 0 ? <Empty>Chưa có đợt nào.</Empty> : (
          <Table head={["Tên đợt", "Bắt đầu", "Kết thúc", ""]} rows={studies.map((s) => [s.title, fmtDate(s.start_at), fmtDate(s.end_at),
            <Link key={s.id} className="text-ink underline" href={`/nghien-cuu/dot/${s.id}`}>Mở đợt</Link>])} />
        )}
      </Section>
      <Section title="Tạo đợt mới">
        <form className="grid max-w-3xl gap-3 sm:grid-cols-[1fr_200px_200px_auto] sm:items-end" onSubmit={(e) => {
          e.preventDefault();
          act.run(async () => {
            await api("studies", { method: "POST", body: { title: f.title,
              start_at: f.start_at ? new Date(f.start_at).toISOString() : null, end_at: f.end_at ? new Date(f.end_at).toISOString() : null } });
            setF({ title: "", start_at: "", end_at: "" }); await load();
          });
        }}>
          <Field label="Tên đợt"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
          <Field label="Bắt đầu"><input type="date" className={inputCls} value={f.start_at} onChange={(e) => setF({ ...f, start_at: e.target.value })} /></Field>
          <Field label="Kết thúc"><input type="date" className={inputCls} value={f.end_at} onChange={(e) => setF({ ...f, end_at: e.target.value })} /></Field>
          <Button type="submit" disabled={act.busy}>Tạo đợt</Button>
        </form>
      </Section>
    </>
  );
}
