"use client";

import { useEffect, useState } from "react";
import { AccountForm } from "@/components/AccountForm";
import { Button, Empty, ErrorNote, Field, Section, Table, inputCls, useAction } from "@/components/ui";
import { api } from "@/lib/client";
import { fmtDate } from "@/lib/types";

type User = { id: string; display_name: string; email: string | null; status: string; username: string | null; roles: string | null };
type Cfg = { id: string; provider: string; model_name: string; prompt_version: string; parameters: string; active: boolean };
type Usage = { purpose: string; outcome: string; n: number; cost_usd: number; avg_latency_ms: number };
type Erasure = { id: string; subject_user_id: string; reason: string; status: string; requested_by: string; requested_at: string };

const OUTCOME_VI: Record<string, string> = { ok: "AI trả lời hợp lệ", fallback_invalid: "Bị chặn, dùng mẫu", fallback_timeout: "Quá thời gian, dùng mẫu",
  fallback_error: "Lỗi kết nối, dùng mẫu", skipped_quota: "Hết lượt", skipped_budget: "Hết ngân sách", skipped_disabled: "AI tắt", skipped_stale: "Bỏ (bài đã đổi)" };

export default function Admin() {
  const [users, setUsers] = useState<User[]>([]);
  const [cfgs, setCfgs] = useState<Cfg[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [erasures, setErasures] = useState<Erasure[]>([]);
  const [cfg, setCfg] = useState({ model_name: "claude-haiku-5-5", prompt_version: "tutor-system-v1", max_output_tokens: "300", price_in: "0.10", price_out: "0.50" });
  const act = useAction();
  const load = async () => {
    const [u, c, us, e] = await Promise.all([api<User[]>("admin/users"), api<Cfg[]>("admin/ai-configs"), api<Usage[]>("admin/ai-usage?days=7"), api<Erasure[]>("erasure-requests")]);
    setUsers(u); setCfgs(c); setUsage(us); setErasures(e);
  };
  useEffect(() => { act.run(load); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const name = (id: string) => users.find((u) => u.id === id)?.display_name ?? id;

  return (
    <>
      <h1 className="mb-6 text-3xl font-semibold">Quản trị</h1>
      <ErrorNote error={act.error} />

      <Section title="Tài khoản">
        <Table head={["Họ tên", "Tên đăng nhập", "Email", "Vai trò", "Trạng thái", ""]} rows={users.map((u) => [u.display_name, u.username ?? "—", u.email ?? "—",
          u.roles ?? "", u.status === "active" ? "Hoạt động" : "Đã khóa",
          <Button key="s" variant={u.status === "active" ? "danger" : "quiet"} disabled={act.busy} onClick={() => act.run(async () => {
            await api(`admin/users/${u.id}/status`, { method: "PATCH", body: { status: u.status === "active" ? "disabled" : "active" } }); await load(); })}>
            {u.status === "active" ? "Khóa" : "Mở khóa"}</Button>])} />
        <div className="mt-4"><AccountForm roles={["student", "teacher", "researcher", "admin"]} onCreated={() => act.run(load)} /></div>
      </Section>

      <Section title="Trợ lý AI">
        <p className="mb-3 max-w-3xl text-sm text-muted">Mỗi cấu hình là bất biến; phiên học giữ cấu hình đang dùng lúc bắt đầu. Khóa API nằm trong biến môi trường máy chủ, không nhập ở đây.</p>
        <Table head={["Nhà cung cấp", "Model", "Prompt", "Tham số", ""]} rows={cfgs.map((c) => [c.provider, c.model_name, c.prompt_version,
          <code key="p" className="text-xs">{c.parameters}</code>, c.active ? <strong key="a" className="text-ok">Đang dùng</strong> : (
            <Button key="b" variant="quiet" disabled={act.busy} onClick={() => act.run(async () => { await api(`admin/ai-configs/${c.id}/activate`, { method: "POST" }); await load(); })}>Dùng cấu hình này</Button>)])} />
        <form className="mt-3 grid gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-5 sm:items-end" onSubmit={(e) => { e.preventDefault(); act.run(async () => {
          await api("admin/ai-configs", { method: "POST", body: { provider: "anthropic", model_name: cfg.model_name, prompt_version: cfg.prompt_version,
            parameters: { max_output_tokens: Number(cfg.max_output_tokens), price_input_per_mtok: Number(cfg.price_in), price_output_per_mtok: Number(cfg.price_out) } } });
          await load(); }); }}>
          <Field label="Model"><input className={inputCls} value={cfg.model_name} onChange={(e) => setCfg({ ...cfg, model_name: e.target.value })} /></Field>
          <Field label="Prompt"><input className={inputCls} value={cfg.prompt_version} onChange={(e) => setCfg({ ...cfg, prompt_version: e.target.value })} /></Field>
          <Field label="Token ra tối đa"><input className={inputCls} value={cfg.max_output_tokens} onChange={(e) => setCfg({ ...cfg, max_output_tokens: e.target.value })} /></Field>
          <Field label="Giá vào / ra (USD/1 triệu token)"><div className="flex gap-1">
            <input className={inputCls} value={cfg.price_in} onChange={(e) => setCfg({ ...cfg, price_in: e.target.value })} />
            <input className={inputCls} value={cfg.price_out} onChange={(e) => setCfg({ ...cfg, price_out: e.target.value })} /></div></Field>
          <Button type="submit" variant="quiet" disabled={act.busy}>Tạo cấu hình</Button>
        </form>
        <h3 className="mb-2 mt-6 font-medium">Sử dụng 7 ngày qua</h3>
        {usage.length === 0 ? <Empty>Chưa có lượt gọi AI.</Empty> : (
          <Table head={["Mục đích", "Kết quả", "Số lượt", "Chi phí (USD)", "Độ trễ TB (ms)"]}
            rows={usage.map((u) => [u.purpose, OUTCOME_VI[u.outcome] ?? u.outcome, u.n, u.cost_usd.toFixed(4), Math.round(u.avg_latency_ms)])} />
        )}
      </Section>

      <Section title="Yêu cầu xóa dữ liệu">
        <p className="mb-3 max-w-3xl text-sm text-muted">Người duyệt phải khác người gửi yêu cầu. Thực hiện là xóa hẳn dữ liệu học tập và kiểm tra của học sinh; không hoàn tác được.</p>
        {erasures.length === 0 ? <Empty>Không có yêu cầu.</Empty> : (
          <Table head={["Học sinh", "Lý do", "Gửi lúc", "Trạng thái", ""]} rows={erasures.map((r) => [name(r.subject_user_id), r.reason, fmtDate(r.requested_at), r.status,
            <span key="a" className="flex gap-2">
              {r.status === "pending" && <>
                <Button variant="quiet" disabled={act.busy} onClick={() => act.run(async () => { await api(`erasure-requests/${r.id}/approve`, { method: "POST" }); await load(); })}>Duyệt</Button>
                <Button variant="quiet" disabled={act.busy} onClick={() => act.run(async () => { await api(`erasure-requests/${r.id}/reject`, { method: "POST" }); await load(); })}>Từ chối</Button></>}
              {r.status === "approved" && <ConfirmErase onConfirm={() => act.run(async () => { await api(`erasure-requests/${r.id}/execute`, { method: "POST" }); await load(); })} />}
            </span>])} />
        )}
      </Section>
    </>
  );
}

/** Irreversible action: typed confirmation instead of a browser dialog. */
function ConfirmErase({ onConfirm }: { onConfirm: () => void }) {
  const [text, setText] = useState("");
  return (
    <span className="flex items-end gap-2">
      <Field label="Gõ XOA để xác nhận"><input className={`${inputCls} w-28`} value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <Button variant="danger" disabled={text !== "XOA"} onClick={onConfirm}>Xóa dữ liệu</Button>
    </span>
  );
}
