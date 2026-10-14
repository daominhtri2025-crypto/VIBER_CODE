"use client";

import { useState } from "react";
import { Button, ErrorNote, Field, inputCls, useAction } from "@/components/ui";
import { api } from "@/lib/client";

const ROLE_VI: Record<string, string> = { student: "Học sinh", teacher: "Giáo viên", researcher: "Người nghiên cứu", admin: "Quản trị" };

/** Creates an account with an initial password (must be changed at first login). Teachers: students only. */
export function AccountForm({ roles, onCreated }: { roles: string[]; onCreated?: () => void }) {
  const [f, setF] = useState({ display_name: "", username: "", initial_password: "", email: "", roles: [roles[0]] });
  const [done, setDone] = useState<string | null>(null);
  const act = useAction();
  return (
    <form className="grid gap-3 rounded-lg border border-line bg-white p-4 sm:grid-cols-2" onSubmit={(e) => {
      e.preventDefault();
      act.run(async () => {
        await api("users", { method: "POST", body: { ...f, email: f.email || null } });
        setDone(`Đã tạo tài khoản ${f.username}. Hãy đưa mật khẩu ban đầu cho người dùng.`);
        setF({ ...f, display_name: "", username: "", initial_password: "", email: "" });
        onCreated?.();
      });
    }}>
      <Field label="Họ tên hiển thị"><input className={inputCls} value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} required /></Field>
      <Field label="Tên đăng nhập" hint="Chữ không dấu, số, dấu chấm"><input className={inputCls} value={f.username} pattern="[A-Za-z0-9._\-]{3,64}" onChange={(e) => setF({ ...f, username: e.target.value })} required /></Field>
      <Field label="Mật khẩu ban đầu" hint="Ít nhất 8 ký tự"><input className={inputCls} type="text" minLength={8} value={f.initial_password} onChange={(e) => setF({ ...f, initial_password: e.target.value })} required /></Field>
      <Field label="Email để đăng nhập Google (không bắt buộc)"><input className={inputCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      {roles.length > 1 && (
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Vai trò</legend>
          <div className="flex flex-wrap gap-3">
            {roles.map((r) => (
              <label key={r} className="flex items-center gap-2">
                <input type="checkbox" checked={f.roles.includes(r)}
                  onChange={(e) => setF({ ...f, roles: e.target.checked ? [...f.roles, r] : f.roles.filter((x) => x !== r) })} />
                {ROLE_VI[r]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="sm:col-span-2 space-y-2">
        <ErrorNote error={act.error} />
        {done && <p className="text-ok">{done}</p>}
        <Button type="submit" disabled={act.busy || f.roles.length === 0}>Tạo tài khoản</Button>
      </div>
    </form>
  );
}
