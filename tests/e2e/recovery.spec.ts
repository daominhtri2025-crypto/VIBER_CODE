import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, createConfirmedUser, deleteUserByEmail, uniqueEmail, waitForAuthLink } from "./helpers/auth";

// TASK-006 · Khôi phục mật khẩu. Cần Supabase local + Mailpit.

const NEUTRAL_SENT = "Nếu email này có tài khoản, chúng tôi đã gửi liên kết đặt lại mật khẩu.";
const createdEmails: string[] = [];

test.afterAll(async () => {
  await Promise.all(createdEmails.map(deleteUserByEmail));
});

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

async function requestReset(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Gửi liên kết đặt lại" }).click();
  await expect(page.getByRole("status")).toContainText(NEUTRAL_SENT);
}

test("quên mật khẩu → email → đặt mật khẩu mới → đăng nhập bằng mật khẩu mới", async ({ page }) => {
  const user = await createConfirmedUser();
  createdEmails.push(user.email);
  const newPassword = "mat-khau-moi-2026";

  await page.goto("/login");
  await page.getByRole("link", { name: "Quên mật khẩu?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await requestReset(page, user.email);

  await page.goto(await waitForAuthLink(user.email));
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(newPassword);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(newPassword);
  await page.getByRole("button", { name: "Đặt mật khẩu mới" }).click();
  await expect(page.getByRole("status")).toContainText("Đã đặt mật khẩu mới.");

  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/$/);
  await login(page, user.email, E2E_PASSWORD);
  await expect(page.locator("form").getByRole("alert")).toHaveText("Email hoặc mật khẩu không đúng.");
  await login(page, user.email, newPassword);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("yêu cầu với email không có tài khoản nhận cùng thông điệp trung tính", async ({ page }) => {
  await page.goto("/forgot-password");
  await requestReset(page, uniqueEmail("khong-ton-tai"));
});

test("link khôi phục sai/hết hạn đưa về trang yêu cầu link mới", async ({ page }) => {
  await page.goto("/auth/callback?code=ma-sai&next=/reset-password");
  await expect(page).toHaveURL(/\/forgot-password\?error=link$/);
  await expect(page.getByRole("status")).toContainText("không hợp lệ, đã hết hạn hoặc đã được dùng");
});

test("link khôi phục đã dùng một lần không dùng lại được", async ({ page, browser }) => {
  const user = await createConfirmedUser();
  createdEmails.push(user.email);

  await page.goto("/forgot-password");
  await requestReset(page, user.email);
  const link = await waitForAuthLink(user.email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password$/);

  const other = await browser.newPage();
  await other.goto(link);
  await expect(other).not.toHaveURL(/\/reset-password$/);
  await expect(other.getByRole("button", { name: "Đặt mật khẩu mới" })).toHaveCount(0);
  await other.close();
});

test("không có session khôi phục: khách và người đăng nhập thường đều không đổi được mật khẩu", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("status")).toContainText("chỉ mở được từ liên kết đặt lại mật khẩu");
  await expect(page.getByRole("button", { name: "Đặt mật khẩu mới" })).toHaveCount(0);

  const user = await createConfirmedUser();
  createdEmails.push(user.email);
  await login(page, user.email, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/reset-password");
  await expect(page.getByRole("status")).toContainText("chỉ mở được từ liên kết đặt lại mật khẩu");
  await expect(page.getByRole("link", { name: "Yêu cầu liên kết mới" })).toBeVisible();
});

test("mật khẩu mới không hợp lệ hiển thị lỗi theo trường", async ({ page }) => {
  const user = await createConfirmedUser();
  createdEmails.push(user.email);

  await page.goto("/forgot-password");
  await requestReset(page, user.email);
  await page.goto(await waitForAuthLink(user.email));
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill("ngan");
  await page.getByLabel("Nhập lại mật khẩu mới").fill("khac");
  await page.getByRole("button", { name: "Đặt mật khẩu mới" }).click();
  await expect(page.getByText("Mật khẩu cần ít nhất 8 ký tự.")).toBeVisible();
  await expect(page.getByText("Mật khẩu nhập lại không khớp.")).toBeVisible();
});
