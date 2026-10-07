import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, createConfirmedUser, deleteUserByEmail, promoteToAdmin } from "./helpers/auth";

// TASK-007 · Bảo vệ route (SITEMAP §2) và hồ sơ. Cần Supabase local.

const createdEmails: string[] = [];

test.afterAll(async () => {
  await Promise.all(createdEmails.map(deleteUserByEmail));
});

async function loginAs(page: Page, email: string, password = E2E_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

// Section "Tên hiển thị" cũng có accessible name trùng nhãn ô nhập → chọn theo role textbox.
function nameInput(page: Page) {
  return page.getByRole("textbox", { name: "Tên hiển thị" });
}

async function newUser(displayName = "[Test] Học viên") {
  const user = await createConfirmedUser(displayName);
  createdEmails.push(user.email);
  return user;
}

test.describe("Ma trận bảo vệ route", () => {
  for (const path of ["/dashboard", "/profile", "/admin"]) {
    test(`khách vào ${path} → đăng nhập kèm next`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=(${encodeURIComponent(path)}|${path})$`));
    });
  }

  test("học viên vào /admin nhận 404 và không thấy liên kết Quản trị", async ({ page }) => {
    const user = await newUser();
    await loginAs(page, user.email);
    await expect(page.getByRole("link", { name: "Quản trị", exact: true })).toHaveCount(0);

    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Quản trị" })).toHaveCount(0);
  });

  test("admin vào được /admin và thấy liên kết Quản trị", async ({ page }) => {
    const user = await newUser("[Test] Quản trị");
    await promoteToAdmin(user.id);
    await loginAs(page, user.email);

    await page.getByRole("link", { name: "Quản trị", exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1, name: "Quản trị" })).toBeVisible();
  });

  test("sau khi đăng nhập từ trang bảo vệ, quay lại đúng trang đó", async ({ page }) => {
    const user = await newUser();
    await page.goto("/profile");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Mật khẩu").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(/\/profile$/);
  });
});

test.describe("Hồ sơ", () => {
  test("hiển thị email chỉ đọc và sửa được tên hiển thị", async ({ page }) => {
    const user = await newUser("[Test] Tên cũ");
    await loginAs(page, user.email);
    await page.goto("/profile");
    await expect(page.getByText(user.email)).toBeVisible();

    const name = nameInput(page);
    await name.fill("  Bạn   Mới ");
    await page.getByRole("button", { name: "Lưu tên hiển thị" }).click();
    await expect(page.getByRole("status")).toHaveText("Đã lưu tên hiển thị.");
    await expect(page.getByRole("link", { name: "Hồ sơ: Bạn Mới" })).toBeVisible();

    await page.reload();
    await expect(nameInput(page)).toHaveValue("Bạn Mới");
  });

  test("tên hiển thị rỗng hoặc quá 50 ký tự bị từ chối", async ({ page }) => {
    const user = await newUser();
    await loginAs(page, user.email);
    await page.goto("/profile");

    await nameInput(page).fill("   ");
    await page.getByRole("button", { name: "Lưu tên hiển thị" }).click();
    await expect(page.getByText("Nhập tên hiển thị.")).toBeVisible();
    await expect(nameInput(page)).toHaveAttribute("aria-invalid", "true");

    // maxLength trên input chặn gõ quá 50; gửi trực tiếp giá trị dài để kiểm tra validate server.
    await nameInput(page).evaluate((input: HTMLInputElement) => {
      input.removeAttribute("maxlength");
      input.value = "x".repeat(51);
    });
    await page.getByRole("button", { name: "Lưu tên hiển thị" }).click();
    await expect(page.getByText("Tên hiển thị tối đa 50 ký tự.")).toBeVisible();
  });

  test("đổi mật khẩu cần đúng mật khẩu hiện tại; sau đó đăng nhập bằng mật khẩu mới", async ({ page }) => {
    const user = await newUser();
    const newPassword = "mat-khau-moi-007";
    await loginAs(page, user.email);
    await page.goto("/profile");

    await page.getByLabel("Mật khẩu hiện tại").fill("sai-mat-khau-1");
    await page.getByLabel("Mật khẩu mới", { exact: true }).fill(newPassword);
    await page.getByLabel("Nhập lại mật khẩu mới").fill(newPassword);
    await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
    await expect(page.getByText("Mật khẩu hiện tại không đúng.")).toBeVisible();

    await page.getByLabel("Mật khẩu hiện tại").fill(E2E_PASSWORD);
    await page.getByLabel("Mật khẩu mới", { exact: true }).fill(newPassword);
    await page.getByLabel("Nhập lại mật khẩu mới").fill(newPassword);
    await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
    await expect(page.getByRole("status")).toHaveText("Đã đổi mật khẩu.");
    // Phiên hiện tại vẫn còn hiệu lực sau khi xác minh mật khẩu.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page).toHaveURL(/\/$/);
    await loginAs(page, user.email, newPassword);
  });
});
