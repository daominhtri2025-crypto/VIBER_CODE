import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage (trang khởi tạo)", () => {
  it("hiển thị tên website bằng tiêu đề cấp 1", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Coding Academy" })).toBeDefined();
  });

  it("gắn nhãn rõ là trang khởi tạo, không giả làm giao diện hoàn chỉnh", () => {
    render(<HomePage />);
    expect(screen.getByText(/Trang khởi tạo/)).toBeDefined();
  });

  it("không chứa liên kết tới chức năng chưa tồn tại", () => {
    const { container } = render(<HomePage />);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });
});
