import { createServer } from 'node:http';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

// Kiểm thử trình duyệt cho trang điều phối (Bước 5): 360px không cuộn ngang, nút tối thiểu 44px,
// bộ lọc gửi đúng mốc UTC+7, CSV tải về có BOM và công thức bị vô hiệu. Dùng máy chủ giả lập chỉ phục vụ
// public/ và API giả lập (CLAUDE.md mục 7: không gọi dịch vụ bên ngoài). Chạy thủ công:
//   node tests/admin-page-browser.mjs [thư_mục_ảnh]
// Cần Playwright và Chromium. Nếu không có, kiểm thử in rõ lý do và thoát mã 2 (không coi là đạt).

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (error) {
  console.log('SKIP: không nạp được Playwright (' + error.message.split('\n')[0] + '). Kiểm thử trình duyệt chưa chạy.');
  process.exit(2);
}

const PUBLIC = 'public';
const shotDir = process.argv[2] || join(process.env.TMPDIR || '/tmp', 'admin-shots');
mkdirSync(shotDir, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
const GROUPS = ['Điện thoại', 'Giao tiếp số', 'Tìm thông tin', 'Biểu mẫu', 'An toàn số'];
const LESSONS = Array.from({ length: 10 }, (_, i) => ({ lesson: i, title: `Bài thử ${i + 1}`, group_no: Math.floor(i / 2) + 1 }));
const requests = [];
const consoleErrors = [];

function reportFor(query) {
  const lessons = LESSONS.map((l) => ({ lesson: l.lesson, completed: l.lesson === 0 ? 2 : 0, attempts: l.lesson === 0 ? 3 : 0, correct: l.lesson === 0 ? 1 : 0, attemptCorrectRate: l.lesson === 0 ? 33 : null }));
  return {
    filter: { from: query.get('from') || null, to: query.get('to') || null, lesson: query.has('lesson') ? Number(query.get('lesson')) : null, group: query.has('group') ? Number(query.get('group')) : null, granularity: query.get('granularity') || 'day' },
    learners: [
      { code: 'ST-TEST-1', attempted: 3, correctLessons: 1, quiz: { status: 'chua_dat', rate: 10 } },
      { code: '=HYPERLINK("http://x")', attempted: 1, correctLessons: 0, quiz: { status: 'chua_dat', rate: 0 } },
    ],
    lessons, groups: [{ group: 1, completed: 2, attempts: 3, correct: 1, attemptCorrectRate: 33 }],
    series: [{ period: '2026-10-27', attempts: 3, correct: 1, completions: 2 }],
    prePost: { pairs: 0, beforeAchieved: 0, afterAchieved: 0 },
    assessmentTotals: { total: 0, achieved: 0 },
  };
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    requests.push(url.pathname + url.search);
    const json = (data) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    // Luồng đăng nhập mới (SRS FR-AUTH): /api/me trả `account` khi đã đăng nhập; thiếu `account` thì trang hiện màn đăng nhập.
    if (url.pathname === '/api/me') return json({ authenticated: true, admin: true, volunteer: true, code: 'ST-ADMIN', progress: [], account: { role: 'admin', email: 'chu-website', fullName: 'Quản trị viên', mustChange: false } });
    if (url.pathname === '/api/accounts') return json({ accounts: [{ id: 'v1', email: 'tnv-thu@example.test', full_name: 'Tình nguyện viên thử', active: 1, must_change: 1, created: new Date().toISOString() }] });
    if (url.pathname === '/api/lessons') return json({ groups: GROUPS, lessons: LESSONS.map((l) => ({ ...l, icon: '', summary: '', steps: [], quiz: { question: '', options: [] }, next_step: '' })) });
    if (url.pathname === '/api/videos') return json([]);
    if (url.pathname === '/api/dashboard') return json({ learners: [], assessments: [], staff: [], at: new Date().toISOString(), report: reportFor(url.searchParams) });
    res.writeHead(404); return res.end();
  }
  const file = url.pathname === '/' ? 'admin.html' : url.pathname.slice(1);
  try {
    const body = readFileSync(join(PUBLIC, file));
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const results = [];
let failedCount = 0;
const check = (name, fn) => results.push({ name, fn });

try {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(base + '/admin.html');
  await page.waitForFunction(() => document.getElementById('rptStatus').textContent.startsWith('Đã cập nhật'), null, { timeout: 5000 });
  // Phần báo cáo nằm trong panel riêng; phải mở panel trước khi thao tác (fill/click cần phần tử hiển thị).
  await page.click('#adminNav [data-panel="reportSection"]');

  check('360px: không cuộn ngang trang', async () => {
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= 360, `scrollWidth = ${width}`);
  });

  check('nút, ô chọn và ô nhập đạt tối thiểu 44px chiều cao', async () => {
    for (const id of ['rptReset', 'rptExport', 'rptFrom', 'rptTo', 'rptGroup', 'rptLesson', 'rptGranularity']) {
      const box = await page.locator('#' + id).boundingBox();
      assert.ok(box && box.height >= 44, `${id} cao ${box?.height}px`);
    }
  });

  check('bộ lọc ngày gửi mốc UTC+7 đúng (đầu ngày và cuối ngày)', async () => {
    requests.length = 0;
    await page.fill('#rptFrom', '2026-10-27');
    await page.fill('#rptTo', '2026-10-27');
    await page.waitForFunction(() => document.getElementById('rptStatus').textContent.startsWith('Đã cập nhật'));
    const last = requests.filter((r) => r.startsWith('/api/dashboard')).pop();
    const params = new URL(last, base).searchParams;
    assert.equal(params.get('from'), '2026-10-26T17:00:00.000Z', 'đầu ngày 27/10 (VN) là 17:00Z ngày 26/10');
    assert.equal(params.get('to'), '2026-10-27T16:59:59.999Z', 'cuối ngày 27/10 (VN) là 16:59:59.999Z');
  });

  check('lọc nhóm và bài gửi đúng tham số; bảng hiển thị dữ liệu của máy chủ', async () => {
    requests.length = 0;
    await page.selectOption('#rptGroup', '1');
    await page.selectOption('#rptLesson', '0');
    await page.waitForFunction(() => document.getElementById('rptStatus').textContent.startsWith('Đã cập nhật'));
    const last = new URL(requests.filter((r) => r.startsWith('/api/dashboard')).pop(), base).searchParams;
    assert.equal(last.get('group'), '1');
    assert.equal(last.get('lesson'), '0');
    const rows = await page.locator('#rptLearners tr').allTextContents();
    assert.ok(rows.some((text) => text.includes('ST-TEST-1') && text.includes('Chưa đạt')), 'thiếu dòng học viên hoặc nhãn trạng thái');
  });

  check('xóa bộ lọc đưa bộ lọc về mặc định', async () => {
    await page.click('#rptReset');
    await page.waitForFunction(() => document.getElementById('rptStatus').textContent.startsWith('Đã cập nhật'));
    assert.equal(await page.inputValue('#rptGroup'), '');
    assert.equal(await page.inputValue('#rptFrom'), '');
  });

  check('ngày bắt đầu sau ngày kết thúc: báo lỗi, không gửi yêu cầu', async () => {
    await page.fill('#rptFrom', '2026-10-28');
    await page.fill('#rptTo', '2026-10-27');
    assert.equal(await page.textContent('#rptStatus'), 'Ngày bắt đầu không được sau ngày kết thúc.');
    await page.click('#rptReset');
    await page.waitForFunction(() => document.getElementById('rptStatus').textContent.startsWith('Đã cập nhật'));
  });

  check('bảng gọn bật/tắt bằng ô chọn', async () => {
    await page.check('#rptCompact');
    assert.equal(await page.evaluate(() => document.getElementById('reportSection').classList.contains('compact')), true);
    await page.uncheck('#rptCompact');
  });

  check('xuất CSV: tệp bắt đầu bằng BOM UTF-8, có tiêu đề tiếng Việt', async () => {
    const path = join(shotDir, 'son-tra-bao-cao.csv');
    // Xóa tệp của lần chạy trước để ca kiểm tra không đạt nhờ dữ liệu cũ.
    rmSync(path, { force: true });
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#rptExport')]);
    await download.saveAs(path);
    const bytes = readFileSync(path);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'thiếu BOM UTF-8');
    const text = bytes.subarray(3).toString('utf8');
    assert.ok(text.includes('Báo cáo thống kê Sơn Trà Số'));
    assert.ok(text.includes('Asia/Saigon (UTC+7)'));
    assert.ok(text.includes('Tự học theo học viên'), 'thiếu khối tự học trong CSV');
    assert.ok(text.includes('Phiếu quan sát'), 'thiếu khối phiếu quan sát trong CSV');
  });

  check('CSV: ô bắt đầu bằng "=" bị thêm nháy đơn và nhân đôi dấu ngoặc kép', async () => {
    const path = join(shotDir, 'son-tra-bao-cao.csv');
    const text = readFileSync(path).subarray(3).toString('utf8');
    assert.ok(text.includes('"\'=HYPERLINK(""http://x"")"'), 'ô công thức chưa được vô hiệu hóa đúng');
    assert.equal(/(^|,)"?=HYPERLINK/m.test(text), false, 'còn ô công thức chưa vô hiệu hóa');
  });

  check('thẻ tổng quan đếm từ báo cáo máy chủ (2 học viên trong dữ liệu giả lập)', async () => {
    const first = await page.locator('#metrics .metric strong').first().textContent();
    assert.equal(first, '2');
  });

  check('không có lỗi JavaScript hay lỗi console trên trang', async () => {
    assert.equal(consoleErrors.length, 0, consoleErrors.join(' | '));
  });

  await page.screenshot({ path: join(shotDir, 'admin-360.png'), fullPage: true });
} catch (error) {
  results.push({ name: 'thiết lập trang', fn: () => { throw error; } });
} finally {
  failedCount = await runChecks();
  await browser.close();
  // Đóng kết nối keep-alive còn lại; nếu không, tiến trình không thoát sau khi kiểm thử xong.
  server.closeAllConnections();
  server.close();
}
if (failedCount) process.exit(1);


async function runChecks() {
  let failed = 0;
for (const { name, fn } of results) {
  try {
    await fn();
    console.log('PASS: ' + name);
  } catch (error) {
    failed++;
    console.log('FAIL: ' + name + ' — ' + error.message.split('\n')[0]);
  }
}
if (failed) return failed;
console.log(`PASS: trang điều phối trên trình duyệt (${results.length} ca) tại 360px.`);
return 0;
}


