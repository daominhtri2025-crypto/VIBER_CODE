"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { Button, ErrorNote, Field, inputCls } from "@/components/ui";

declare global {
  interface Window { google?: { accounts: { id: {
    initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
    renderButton: (el: HTMLElement, o: Record<string, string>) => void;
  } } } }
}

function nextPath(): string {
  const n = new URLSearchParams(window.location.search).get("next") ?? "/";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export function LoginForm({ googleClientId }: { googleClientId: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gReady, setGReady] = useState(false);

  async function done(r: Response) {
    if (r.ok) { window.location.href = nextPath(); return; }
    const data = await r.json().catch(() => ({}));
    setError(data.message ?? "Đăng nhập không thành công.");
  }

  useEffect(() => {
    if (!gReady || !googleClientId || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async ({ credential }) => done(await fetch("/bff/auth/google", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential }),
      })),
    });
    const el = document.getElementById("google-btn");
    if (el) window.google.accounts.id.renderButton(el, { theme: "outline", size: "large", text: "signin_with", locale: "vi" });
  }, [gReady, googleClientId]);

  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setError(null);
      try {
        await done(await fetch("/bff/auth/login", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }),
        }));
      } finally { setBusy(false); }
    }}>
      <Field label="Tên đăng nhập">
        <input className={inputCls} name="username" autoComplete="username" value={username}
          onChange={(e) => setUsername(e.target.value)} required />
      </Field>
      <Field label="Mật khẩu">
        <input className={inputCls} name="password" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <ErrorNote error={error} />
      <Button type="submit" disabled={busy} className="w-full">{busy ? "Đang đăng nhập…" : "Đăng nhập"}</Button>
      {googleClientId && (
        <>
          <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => setGReady(true)} />
          <div className="pt-2 text-center text-sm text-muted">hoặc</div>
          <div id="google-btn" className="flex justify-center" />
          <p className="text-xs text-muted">Đăng nhập Google chỉ dùng được khi email đã được nhà trường đăng ký trước.</p>
        </>
      )}
    </form>
  );
}
