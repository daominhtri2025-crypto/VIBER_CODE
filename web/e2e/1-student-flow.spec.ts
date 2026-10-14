import { expect, test } from "@playwright/test";
import { login, typeWithPad } from "./helpers";

test.describe.configure({ mode: "serial" });

test("student solves 2x + 5 = 17 step by step, gets feedback and a hint, verifies, then practises alone", async ({ page }) => {
  await login(page, "hs.b");
  await expect(page).toHaveURL(/\/hoc$/);
  await page.getByRole("button", { name: "Làm bài" }).first().click();
  await expect(page.getByRole("heading", { name: /2x \+ 5 = 17/ })).toBeVisible();
  await page.screenshot({ path: "test-results/01-read-problem.png", fullPage: true });

  await page.getByLabel(/Đề bài yêu cầu em làm gì/).fill("Tìm giá trị của x");
  await page.getByRole("button", { name: "Gửi" }).click();
  await page.getByRole("radio", { name: /Quy tắc chuyển vế/ }).check();
  await page.getByRole("button", { name: "Gửi lựa chọn" }).click();
  await page.getByRole("radio", { name: "Trừ 5 ở cả hai vế" }).check();
  await page.getByRole("button", { name: "Gửi lựa chọn" }).click();
  await expect(page.locator('[aria-current="step"]')).toContainText("Giải");

  // wrong step: 2x = 22 (added instead of subtracting) typed on the symbol keyboard
  await typeWithPad(page, "Phương trình sau khi biến đổi", ["2", "x", "=", "2", "2"]);
  await expect(page.locator(".katex").first()).toBeVisible();
  await page.getByLabel("Em đã làm gì?").selectOption("subtract_both_sides");
  await page.getByLabel("Với số / hạng tử").fill("5");
  await page.getByRole("button", { name: "Ghi bước này" }).click();
  const tutor = page.getByRole("complementary", { name: "Trợ lý" });
  await expect(tutor.getByText("Chưa đúng", { exact: true })).toBeVisible();
  await expect(tutor.getByRole("heading", { name: "Trợ lý AI" })).toBeVisible();
  await expect(tutor.getByText(/do trợ lý AI tạo ra/)).toBeVisible();
  await expect(page.getByLabel("Bước chưa đúng")).toBeVisible();

  await page.getByRole("button", { name: "Xin gợi ý" }).click();
  await expect(tutor.getByText("Gợi ý mức 1")).toBeVisible();
  await page.screenshot({ path: "test-results/02-wrong-step-hint.png", fullPage: true });

  const eq = page.getByLabel("Phương trình sau khi biến đổi", { exact: true });
  await eq.fill("2x = 12");
  await page.getByRole("button", { name: "Ghi bước này" }).click();
  await expect(tutor.getByText("Bước đúng", { exact: true })).toBeVisible();
  await eq.fill("x = 6");
  await page.getByLabel("Em đã làm gì?").selectOption("divide_both_sides");
  await page.getByLabel("Với số / hạng tử").fill("2");
  await page.getByRole("button", { name: "Ghi bước này" }).click();
  await expect(page.locator('[aria-current="step"]')).toContainText("Kiểm tra");

  await page.getByLabel(/Thay giá trị em tìm được/).fill("2×6 + 5 = 17");
  await page.getByRole("button", { name: "Kiểm tra" }).click();
  await expect(page.getByRole("link", { name: "Làm bài tương tự" })).toBeVisible();
  await page.screenshot({ path: "test-results/03-verified.png", fullPage: true });

  // independent practice: no hint button, no right/wrong before submitting
  await page.getByRole("link", { name: "Làm bài tương tự" }).click();
  await expect(page.getByRole("heading", { name: /3x - 4 = 11/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xin gợi ý" })).toHaveCount(0);
  await page.getByLabel("Phương trình sau khi biến đổi", { exact: true }).fill("3x = 15");
  await page.getByLabel("Em đã làm gì?").selectOption("transpose_term");
  await page.getByLabel("Với số / hạng tử").fill("-4");
  await page.getByRole("button", { name: "Ghi bước này" }).click();
  await expect(tutor.getByText("Đã lưu bước của em.")).toBeVisible();
  await expect(page.getByLabel("Bước đúng")).toHaveCount(0);
  await page.getByLabel("Phương trình sau khi biến đổi", { exact: true }).fill("x = 5");
  await page.getByLabel("Em đã làm gì?").selectOption("divide_both_sides");
  await page.getByLabel("Với số / hạng tử").fill("3");
  await page.getByRole("button", { name: "Ghi bước này" }).click();
  await expect(tutor.getByText("Đã lưu bước của em.")).toBeVisible();
  await page.getByRole("button", { name: "Nộp bài" }).click();
  await expect(page.getByText("Em đã tìm ra kết quả đúng.")).toBeVisible();
});

test("reload keeps the session state and history", async ({ page }) => {
  await login(page, "hs.b");
  await page.locator('section:has(h2:text("Bài đã làm")) a[href^="/hoc/phien/"]').last().click();
  const steps = page.getByRole("list", { name: "Các bước em đã viết" }).getByRole("listitem");
  await expect(steps.first()).toBeVisible();
  const before = await steps.count();
  await page.reload();
  await expect(steps).toHaveCount(before);
  expect(before).toBeGreaterThan(0);
});

test("the solving page works on a phone", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "vi-VN" });
  const page = await ctx.newPage();
  await login(page, "hs.a");
  await page.locator('a[href^="/hoc/phien/session-demo"]').click();
  await expect(page.getByLabel("Phương trình sau khi biến đổi", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Phím Toán" }).click();
  await expect(page.getByLabel("Phương trình sau khi biến đổi", { exact: true })).toHaveAttribute("inputmode", "none");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/04-mobile.png", fullPage: true });
  await ctx.close();
});
