import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, createConfirmedUser, deleteUserByEmail, uniqueEmail, waitForAuthLink } from "./helpers/auth";

// TASK-005 · Cần Supabase local đang chạy (`npm run db:start`) và .env.local (`npm run db:env`).

const NEUTRAL_LOGIN_ERROR = "Email hoặc mật khẩu không đúng.";
const createdEmails: string[] = [];

test.afterAll(async () => {
  await Promise.all(createdEmails.map(deleteUserByEmail));
});

// Next.js có route announcer cũng mang role="alert"; chỉ lấy alert trong form.
function formAlert(page: Page) {
  return page.locator("form").getByRole("alert");
}

async function login(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

test("đăng ký → xác thực email → dashboard → đăng xuất → đăng nhập lại", async ({ page }) => {
  const email = uniqueEmail("signup");
  createdEmails.push(email);

  await page.goto("/register");
  await page.getByLabel("Tên hiển thị (không bắt buộc)").fill("Bé Na");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("Nhập lại mật khẩu").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByRole("status")).toContainText("Kiểm tra hộp thư của bạn");

  await page.goto(await waitForAuthLink(email));
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Xin chào, Bé Na!");
  await expect(page.getByRole("navigation", { name: "Tài khoản" })).toContainText("Bé Na");

  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();

  // Sau khi đăng xuất, trang cá nhân không còn truy cập được (kể cả bấm Back).
  await page.goBack();
  await page.reload();
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)dashboard$/);

  await login(page, email, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("sai mật khẩu và email không tồn tại nhận cùng thông điệp trung tính", async ({ page }) => {
  const user = await createConfirmedUser();
  createdEmails.push(user.email);

  await page.goto("/login");
  await login(page, user.email, "mat-khau-sai-123");
  await expect(formAlert(page)).toHaveText(NEUTRAL_LOGIN_ERROR);
  await expect(page.getByLabel("Email")).toHaveValue(user.email);

  await page.goto("/login");
  await login(page, uniqueEmail("khong-ton-tai"), "mat-khau-sai-123");
  await expect(formAlert(page)).toHaveText(NEUTRAL_LOGIN_ERROR);
});

test("đăng ký bằng email đã tồn tại không tiết lộ tài khoản", async ({ page }) => {
  const user = await createConfirmedUser();
  createdEmails.push(user.email);

  await page.goto("/register");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel("Nhập lại mật khẩu").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByRole("status")).toContainText("Kiểm tra hộp thư của bạn");
});

test("lỗi validate hiển thị theo trường và giữ dữ liệu đã nhập (trừ mật khẩu)", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Tên hiển thị (không bắt buộc)").fill("An");
  await page.getByLabel("Email").fill("khong-phai-email");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("ngan");
  await page.getByLabel("Nhập lại mật khẩu").fill("khac");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();

  const email = page.getByLabel("Email");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Email chưa đúng định dạng.")).toBeVisible();
  await expect(page.getByText("Mật khẩu cần ít nhất 8 ký tự.")).toBeVisible();
  await expect(page.getByText("Mật khẩu nhập lại không khớp.")).toBeVisible();
  await expect(email).toHaveValue("khong-phai-email");
  await expect(page.getByLabel("Tên hiển thị (không bắt buộc)")).toHaveValue("An");
  await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveValue("");
});

test("tham số next trỏ ra ngoài bị bỏ qua (chống open redirect)", async ({ page }) => {
  const user = await createConfirmedUser();
  createdEmails.push(user.email);

  await page.goto("/login?next=https://evil.example/steal");
  await login(page, user.email, E2E_PASSWORD);
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/dashboard$/);
});

test("người đã đăng nhập vào /login hoặc /register được chuyển tới /dashboard", async ({ page }) => {
  const user = await createConfirmedUser();
  createdEmails.push(user.email);

  await page.goto("/login");
  await login(page, user.email, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/register");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("khách vào /dashboard được chuyển tới đăng nhập kèm next", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)dashboard$/);
});

test("link xác thực sai hoặc hết hạn hiển thị hướng dẫn", async ({ page }) => {
  await page.goto("/auth/callback?code=ma-khong-hop-le");
  await expect(page).toHaveURL(/\/login\?error=link$/);
  await expect(page.getByRole("status")).toContainText("Liên kết không hợp lệ");
});
