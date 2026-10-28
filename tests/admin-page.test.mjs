import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Kiểm thử tĩnh cho giao diện báo cáo quản trị (Bước 5; FR-DSH-01 đến 07; CLAUDE.md mục 2 và 6).
// Kiểm tra cấu trúc mã nguồn: không chèn HTML từ dữ liệu, nhãn khớp máy chủ, có BOM, chống công thức CSV,
// và logic ghép trước–sau không còn nằm ở client. Kiểm thử trên trình duyệt (360px, tải CSV) nằm ở tests/admin-page-browser.mjs.

const report = readFileSync('public/admin-report.js', 'utf8');
const adminJs = readFileSync('public/admin.js', 'utf8');
const rules = readFileSync('shared/dashboard-rules.ts', 'utf8');

// 1) Không chèn HTML từ API: mọi nội dung đi qua textContent hoặc DOM API (CLAUDE.md mục 2).
{
  for (const banned of [/innerHTML/, /insertAdjacentHTML/, /\beval\s*\(/, /dangerouslySetInnerHTML/]) {
    assert.equal(banned.test(report), false, `admin-report.js không được dùng ${banned}`);
  }
}

// 2) Nhãn trạng thái phải khớp PASS_LABEL của máy chủ (một nguồn sự thật, hai bản sao có kiểm tra).
{
  const serverBlock = rules.match(/PASS_LABEL[^=]*=\s*\{([\s\S]*?)\};/)?.[1] ?? '';
  const clientBlock = report.match(/const PASS_LABEL = \{([\s\S]*?)\};/)?.[1] ?? '';
  const parse = (block) => Object.fromEntries([...block.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
  const server = parse(serverBlock);
  assert.ok(Object.keys(server).length === 3, 'không đọc được PASS_LABEL của máy chủ');
  assert.deepEqual(parse(clientBlock), server, 'nhãn phía client lệch khỏi máy chủ');
}

// 3) CSV: có BOM UTF-8 (FR-DSH-04) và chống công thức bằng tiền tố nháy đơn.
{
  assert.ok(report.includes("'\\ufeff'"), 'thiếu BOM UTF-8 khi xuất CSV');
  assert.ok(report.includes('/^[=+@-]/'), 'thiếu chống công thức CSV');
  assert.ok(report.includes("charset=utf-8"), 'thiếu charset trong Blob CSV');
}

// 4) Múi giờ: đổi ngày sang mốc UTC theo +07:00 (khớp REPORT_UTC_OFFSET_MINUTES = 7 * 60).
{
  assert.ok(rules.includes('REPORT_UTC_OFFSET_MINUTES = 7 * 60'), 'máy chủ không dùng UTC+7');
  assert.ok(report.includes("VN_OFFSET = '+07:00'"), 'giao diện không dùng UTC+7');
}

// 5) Ghép trước–sau chỉ do máy chủ tính: admin.js không còn logic của phiên bản cũ.
{
  assert.equal(adminJs.includes('Trước học'), false, 'admin.js vẫn tính ghép trước–sau');
  assert.equal(adminJs.includes('pairs'), false, 'admin.js vẫn có biến pairs');
  assert.ok(report.includes('report.prePost'), 'báo cáo phải lấy prePost từ máy chủ');
}

// 6) Mọi màn hình có trạng thái tải, rỗng, lỗi và thành công (CLAUDE.md mục 6).
{
  assert.ok(report.includes('Đang tải báo cáo'), 'thiếu trạng thái đang tải');
  assert.ok(report.includes('Chưa có dữ liệu'), 'thiếu trạng thái rỗng');
  assert.ok(report.includes('Chưa tải được báo cáo'), 'thiếu trạng thái lỗi');
  assert.ok(report.includes('Đã cập nhật'), 'thiếu trạng thái thành công');
}

// 7) Phản hồi cũ bị bỏ qua để bảng luôn khớp bộ lọc hiện tại.
{
  assert.ok(report.includes('if (seq !== requestSeq) return'), 'thiếu chống phản hồi cũ');
}

// 8) Phần cũ đã dọn: không còn hàm xuất CSV cũ, không tự đếm phiếu đạt ở client; phiếu đạt lấy từ máy chủ.
{
  assert.equal(adminJs.includes('exportDashboard'), false, 'còn hàm xuất CSV cũ trong admin.js');
  assert.equal(adminJs.includes('x===3'), false, 'admin.js vẫn tự đếm phiếu đạt');
  assert.ok(adminJs.includes('report.assessmentTotals'), 'phiếu đạt phải lấy từ máy chủ');
  assert.equal(adminJs.includes('d.learners.length'), false, 'thẻ học viên vẫn đếm ở client');
  assert.equal(adminJs.includes('d.assessments.length'), false, 'thẻ phiếu vẫn đếm ở client');
}

console.log('PASS: giao diện báo cáo (tĩnh): không chèn HTML từ API, nhãn khớp máy chủ, CSV có BOM và chống công thức, UTC+7, ghép trước–sau chỉ ở máy chủ, đủ trạng thái, chống phản hồi cũ');
