import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.E2E_PASSWORD ?? "Demo-2026!";

export async function login(page: Page, username: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu").fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
}

/** Type an equation with the on-screen keyboard (what a tablet user does). */
export async function typeWithPad(page: Page, label: string, keys: string[]) {
  const field = page.getByLabel(label, { exact: true });
  await field.click();
  const toggle = page.getByRole("button", { name: "Phím Toán" });
  if (await toggle.isVisible()) await toggle.click();
  const pad = page.getByRole("group", { name: "Bàn phím ký hiệu Toán" });
  for (const k of keys) {
    const aria = { "+": "cộng", "-": "trừ", "×": "nhân", ":": "chia", "=": "bằng", "(": "mở ngoặc", ")": "đóng ngoặc", x: "ẩn x" }[k] ?? k;
    await pad.getByRole("button", { name: aria, exact: true }).click();
  }
}
