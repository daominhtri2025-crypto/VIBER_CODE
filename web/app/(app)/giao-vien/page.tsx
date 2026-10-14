"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Empty, ErrorNote, Field, Section, Table, inputCls, useAction } from "@/components/ui";
import { api } from "@/lib/client";

type Cls = { id: string; name: string; school_year: string; students: number };

export default function TeacherHome() {
  const [classes, setClasses] = useState<Cls[] | null>(null);
  const [name, setName] = useState("");
  const [year, setYear] = useState("2026–2027");
  const act = useAction();
  const load = async () => setClasses(await api<Cls[]>("classes"));
  useEffect(() => { act.run(load); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <>
      <h1 className="mb-6 text-3xl font-semibold">Lớp học</h1>
      <ErrorNote error={act.error} />
      <Section title="Lớp em phụ trách">
        {classes === null ? <p className="text-muted">Đang tải…</p> : classes.length === 0 ? <Empty>Chưa có lớp. Tạo lớp đầu tiên ở dưới.</Empty> : (
          <Table head={["Lớp", "Năm học", "Học sinh", ""]} rows={classes.map((c) => [
            c.name, c.school_year, c.students, <Link key={c.id} className="text-ink underline" href={`/giao-vien/lop/${c.id}`}>Mở lớp</Link>])} />
        )}
      </Section>
      <Section title="Tạo lớp mới">
        <form className="grid max-w-xl gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end" onSubmit={(e) => {
          e.preventDefault();
          act.run(async () => { await api("classes", { method: "POST", body: { name, school_year: year } }); setName(""); await load(); });
        }}>
          <Field label="Tên lớp"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Năm học"><input className={inputCls} value={year} onChange={(e) => setYear(e.target.value)} required /></Field>
          <Button type="submit" disabled={act.busy}>Tạo lớp</Button>
        </form>
      </Section>
    </>
  );
}
