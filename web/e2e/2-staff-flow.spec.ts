import { expect, test } from "@playwright/test";
import { login, typeWithPad } from "./helpers";

test.describe.configure({ mode: "serial" });

test("teacher writes, approves and assigns a new problem, then follows the class", async ({ page }) => {
  await login(page, "gv.demo");
  await page.goto("/giao-vien/ngan-hang");
  await typeWithPad(page, "Phương trình", ["5", "x", "-", "2", "=", "1", "3"]);
  await page.getByLabel("Lời giải nội bộ (chỉ giáo viên thấy)").fill("Chuyển vế được 5x = 15, chia 5 được x = 3.");
  await page.getByLabel("Gợi ý mức 1 (định hướng)").fill("Hạng tử nào cần chuyển?");
  await page.getByLabel("Gợi ý mức 2 (nhắc quy tắc)").fill("Chuyển vế phải đổi dấu.");
  await page.getByLabel("Gợi ý mức 3 (gợi thao tác, không tính hộ)").fill("Thử chuyển -2 sang vế phải.");
  await page.getByRole("button", { name: "Lưu bản nháp" }).click();
  const row = page.getByRole("row", { name: /5x−2=13|5x-2=13/ });
  await row.getByRole("button", { name: "Duyệt" }).click();
  await expect(page.getByRole("row", { name: /5x.2=13/ })).toContainText("Đã duyệt");

  await page.goto("/giao-vien");
  await page.getByRole("link", { name: "Mở lớp" }).click();
  await page.getByLabel("Tiêu đề").fill("Luyện thêm");
  await page.getByLabel(/^Chế độ/).selectOption("guided");
  await page.getByRole("checkbox", { name: /5x.2=13/ }).check();
  await page.getByRole("button", { name: "Giao bài" }).click();
  await expect(page.getByText(/danh mục kiến thức/)).toBeVisible();  // guided needs a catalogue
  await page.getByLabel(/^Chế độ/).selectOption("practice");
  await page.getByRole("button", { name: "Giao bài" }).click();
  await expect(page.getByRole("row", { name: /Luyện thêm/ })).toBeVisible();

  await expect(page.getByRole("row", { name: /Học sinh mẫu B/ }).first()).toBeVisible();
  await page.getByRole("row", { name: /Học sinh mẫu B/ }).first().getByRole("link", { name: "Xem từng bước" }).click();
  await expect(page.getByRole("heading", { name: "Quá trình làm bài" })).toBeVisible();
  await page.screenshot({ path: "test-results/05-teacher-session.png", fullPage: true });
});

test("researcher runs a post-test: student sits it, blind grading, publication, export", async ({ page }) => {
  await login(page, "nc.demo");
  await page.goto("/nghien-cuu");
  await page.getByRole("link", { name: "Mở đợt" }).click();
  await page.getByLabel("Tên", { exact: true }).fill("Kiểm tra sau thực nghiệm");
  await page.getByLabel("Giai đoạn").selectOption("post");
  await page.getByRole("checkbox", { name: /4x \+ 3 = 2x \+ 15/ }).check();
  await page.getByRole("button", { name: "Tạo bài kiểm tra" }).click();
  await expect(page.getByRole("row", { name: /Kiểm tra sau thực nghiệm/ })).toBeVisible();

  await login(page, "hs.b");
  await page.getByRole("listitem").filter({ hasText: "Kiểm tra sau thực nghiệm" }).getByRole("button", { name: "Bắt đầu" }).click();
  await expect(page.getByText("không có gợi ý")).toBeVisible();
  await expect(page.getByRole("button", { name: "Xin gợi ý" })).toHaveCount(0);
  await page.getByLabel(/Lời giải/).fill("2x = 12; x = 6");
  await page.getByLabel("Giải thích").fill("Chuyển vế rồi chia hai vế cho 2");
  await page.getByRole("button", { name: "Nộp bài" }).click();
  await expect(page.getByText("Em đã nộp bài")).toBeVisible();

  await login(page, "nc.demo");
  await page.goto("/nghien-cuu");
  await page.getByRole("link", { name: "Mở đợt" }).click();
  const card = page.getByRole("listitem").filter({ hasText: "2x = 12; x = 6" });
  await expect(card).not.toContainText("Học sinh mẫu B");      // blind: code only
  await card.getByLabel(/Lời giải \(tối đa/).fill("7");
  await card.getByLabel(/Giải thích \(tối đa/).fill("2.5");
  await card.getByRole("button", { name: "Lưu điểm" }).click();
  await page.getByRole("row", { name: /Kiểm tra sau thực nghiệm/ }).getByRole("button", { name: "Công bố kết quả" }).click();
  const csv = await page.request.get("/bff/api/studies/study-demo/export");
  const text = await csv.text();
  expect(text).toContain("participant_code");
  expect(text).not.toContain("Học sinh mẫu");
  await page.screenshot({ path: "test-results/06-research.png", fullPage: true });

  await login(page, "hs.b");
  await page.getByRole("listitem").filter({ hasText: "Kiểm tra sau thực nghiệm" }).getByRole("link", { name: "Xem kết quả" }).click();
  await expect(page.getByText("Tổng điểm: 9.5")).toBeVisible();
});

test("admin creates an account and completes a two-person erasure", async ({ page }) => {
  await login(page, "nc.demo");
  await page.goto("/nghien-cuu");
  await page.getByRole("link", { name: "Mở đợt" }).click();
  await page.getByRole("combobox", { name: "Học sinh" }).last().selectOption({ label: "Học sinh mẫu A" });
  await page.getByLabel("Lý do").fill("Phụ huynh rút đồng ý tham gia");
  await page.getByRole("button", { name: "Gửi yêu cầu xóa" }).click();

  await login(page, "qt.demo");
  await page.goto("/quan-tri");
  await page.getByLabel("Họ tên hiển thị").fill("Giáo viên Mới");
  await page.getByLabel("Tên đăng nhập").fill("gv.moi");
  await page.getByLabel("Mật khẩu ban đầu").fill("Mat-khau-moi-1");
  await page.getByRole("checkbox", { name: "Giáo viên" }).check();
  await page.getByRole("checkbox", { name: "Học sinh" }).uncheck();
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByText("Đã tạo tài khoản gv.moi")).toBeVisible();

  const req = page.getByRole("row", { name: /Phụ huynh rút đồng ý/ });
  await req.getByRole("button", { name: "Duyệt" }).click();
  await expect(req.getByRole("button", { name: "Xóa dữ liệu" })).toBeDisabled();
  await req.getByLabel("Gõ XOA để xác nhận").fill("XOA");
  await req.getByRole("button", { name: "Xóa dữ liệu" }).click();
  await expect(page.getByRole("row", { name: /Phụ huynh rút đồng ý/ })).toContainText("executed");
  await page.screenshot({ path: "test-results/07-admin.png", fullPage: true });

  await login(page, "hs.a");
  await expect(page.getByText("Em chưa làm bài nào.")).toBeVisible();
});

test("a new account must set its own password at first login", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Tên đăng nhập").fill("gv.moi");
  await page.getByLabel("Mật khẩu").fill("Mat-khau-moi-1");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Đặt mật khẩu riêng" })).toBeVisible();
  await page.getByLabel("Mật khẩu được cấp").fill("Mat-khau-moi-1");
  await page.getByLabel(/^Mật khẩu mới/).fill("Rieng-cua-toi-9");
  await page.getByLabel("Nhập lại mật khẩu mới").fill("Rieng-cua-toi-9");
  await page.getByRole("button", { name: "Lưu mật khẩu mới" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Tên đăng nhập").fill("gv.moi");
  await page.getByLabel("Mật khẩu").fill("Rieng-cua-toi-9");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Lớp học" })).toBeVisible();
});
