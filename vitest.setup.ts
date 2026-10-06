import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library chỉ tự dọn DOM khi bật globals; dọn tường minh để các test độc lập.
afterEach(() => {
  cleanup();
});
