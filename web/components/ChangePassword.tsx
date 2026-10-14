"use client";

import { useState } from "react";
import { Button, ErrorNote, Field, inputCls, useAction } from "./ui";
import { api } from "@/lib/client";

/** First login with a teacher/admin-issued password: the user must choose their own. */
export function ChangePassword() {
  const [oldPw, setOld] = useState("");
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const act = useAction();
  return (
    <div className="mx-auto max-w-md rounded-xl border border-line bg-white p-6">
      <h1 className="mb-2 text-2xl font-semibold">Đặt mật khẩu riêng</h1>
      <p className="mb-4 text-muted">Đây là lần đăng nhập đầu. Hãy đổi mật khẩu được cấp sang mật khẩu của riêng bạn.</p>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        if (pw !== again) { act.setError(new Error("Hai mật khẩu mới chưa giống nhau.")); return; }
        act.run(async () => {
          await api("auth/password", { method: "POST", body: { old_password: oldPw, new_password: pw } });
          await fetch("/bff/auth/logout", { method: "POST" });
          window.location.href = "/login";
        });
      }}>
        <Field label="Mật khẩu được cấp"><input className={inputCls} type="password" autoComplete="current-password" value={oldPw} onChange={(e) => setOld(e.target.value)} required /></Field>
        <Field label="Mật khẩu mới" hint="Ít nhất 8 ký tự"><input className={inputCls} type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
        <Field label="Nhập lại mật khẩu mới"><input className={inputCls} type="password" autoComplete="new-password" minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} required /></Field>
        <ErrorNote error={act.error} />
        <Button type="submit" disabled={act.busy}>Lưu mật khẩu mới</Button>
      </form>
    </div>
  );
}
