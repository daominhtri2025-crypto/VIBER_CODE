"use client";

import { useEffect, useState } from "react";
import { Button, Empty, ErrorNote, inputCls, useAction } from "@/components/ui";
import { api } from "@/lib/client";

type Rep = { id: string; reason: string; status: string; resolution: string | null; message_content: string; session_id: string };

function messageText(raw: string): string {
  try { const env = JSON.parse(raw); return env.text ?? raw; } catch { return raw; }
}

export default function FeedbackReports() {
  const [items, setItems] = useState<Rep[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const act = useAction();
  const load = async () => setItems(await api<Rep[]>("feedback-reports"));
  useEffect(() => { act.run(load); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  return (
    <>
      <h1 className="mb-2 text-3xl font-semibold">Phản hồi bị học sinh báo</h1>
      <p className="mb-6 text-muted">Xem lại phản hồi của trợ lý mà học sinh thấy sai hoặc khó hiểu, rồi ghi cách xử lý.</p>
      <ErrorNote error={act.error} />
      {items === null ? <p className="text-muted">Đang tải…</p> : items.length === 0 ? <Empty>Chưa có phản hồi nào bị báo.</Empty> : (
        <ul className="space-y-4">
          {items.map((r) => (
            <li key={r.id} className="rounded-lg border border-line bg-white p-4">
              <p className="mb-1 text-sm text-muted">Trạng thái: {r.status === "open" ? "Mới" : r.status === "reviewing" ? "Đang xem" : "Đã xử lý"}</p>
              <blockquote className="mb-2 border-l-4 border-grid pl-3">{messageText(r.message_content)}</blockquote>
              <p className="mb-3"><span className="text-muted">Học sinh báo:</span> {r.reason}</p>
              {r.status !== "resolved" ? (
                <div className="flex flex-wrap gap-2">
                  <input className={`${inputCls} max-w-md`} placeholder="Cách xử lý" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  <Button variant="quiet" onClick={() => act.run(async () => { await api(`feedback-reports/${r.id}`, { method: "PATCH", body: { status: "resolved", resolution: notes[r.id] || null } }); await load(); })}>Đánh dấu đã xử lý</Button>
                </div>
              ) : <p className="text-ok">Đã xử lý{r.resolution ? `: ${r.resolution}` : ""}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
