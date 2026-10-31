// Báo cáo thống kê chuyên sâu cho quản trị viên (Bước 5; FR-DSH-01 đến 07).
// Mọi quy tắc (ngưỡng đạt, múi giờ, ghép trước–sau) nằm trên máy chủ trong shared/dashboard-rules.
// File này chỉ lấy số liệu đã tính, hiển thị và xuất CSV. Không tính lại ngưỡng ở client.
// Dùng api, el, text, cell của admin.js: các hàm và biến đó nằm trong cùng phạm vi script cổ điển.
(function () {
  // Khớp PASS_LABEL trong shared/dashboard-rules.ts. Chuỗi cố định, không lấy từ dữ liệu người dùng.
  const PASS_LABEL = { dat: 'Đạt kiểm tra nội bộ', chua_dat: 'Chưa đạt', chua_co_du_lieu: 'Chưa có dữ liệu' };
  // Giờ Việt Nam không có giờ mùa hè, nên độ lệch cố định +07:00 là đủ để đổi ngày sang mốc UTC.
  const VN_OFFSET = '+07:00';

  let groupNames = [];
  const lessonNames = new Map();
  const hiddenLessons = new Set();
  const lessonGroup = new Map();
  let lastReport = null;
  let lastLegacy = { learners: [], assessments: [] };
  let requestSeq = 0;
  let ready = false;

  const field = (id) => document.getElementById(id);
  const status = (message) => { field('rptStatus').textContent = message; };

  // Từ ngày lấy đầu ngày, đến ngày lấy cuối ngày (bao gồm). Trả về ISO UTC có Z như máy chủ yêu cầu.
  function boundary(day, endOfDay) {
    if (!day) return null;
    const time = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
    return new Date(day + time + VN_OFFSET).toISOString();
  }

  function currentFilter() {
    return {
      from: boundary(field('rptFrom').value, false),
      to: boundary(field('rptTo').value, true),
      lesson: field('rptLesson').value,
      group: field('rptGroup').value,
      granularity: field('rptGranularity').value || 'day',
    };
  }

  function queryString(filter) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filter)) if (value) params.set(key, value);
    return params.toString();
  }

  const groupName = (group) => (group ? groupNames[group - 1] || 'Nhóm ' + group : '—');
  const lessonLabel = (lesson) => (lesson + 1) + '. ' + (lessonNames.get(lesson) || '') + (hiddenLessons.has(lesson) ? ' (đã ẩn)' : '');
  const rateText = (rate) => (rate == null ? 'Chưa có lượt làm' : rate + '%');

  function option(value, label) {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    return node;
  }

  function fillSelects() {
    const lessonOptions = [...lessonNames.keys()].sort((a, b) => a - b).map((n) => option(String(n), lessonLabel(n)));
    field('rptGroup').replaceChildren(option('', 'Tất cả nhóm'), ...groupNames.map((name, i) => option(String(i + 1), (i + 1) + '. ' + name)));
    field('rptLesson').replaceChildren(option('', 'Tất cả bài'), ...lessonOptions);
  }

  // Bảng rỗng hiển thị một dòng trạng thái, không để trống hoàn toàn.
  function fillTable(tbodyId, rows, colspan) {
    const tbody = field(tbodyId);
    tbody.replaceChildren();
    if (rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = colspan;
      td.textContent = 'Chưa có dữ liệu';
      tr.append(td);
      tbody.append(tr);
      return;
    }
    for (const values of rows) {
      const tr = document.createElement('tr');
      values.forEach((value) => cell(tr, value));
      tbody.append(tr);
    }
  }

  function render(report) {
    for (const s of report.lessons) {
      if (s.hidden) hiddenLessons.add(s.lesson);
      else hiddenLessons.delete(s.lesson);
    }
    fillTable('rptLessons', report.lessons.map((s) => [
      lessonLabel(s.lesson), groupName(lessonGroup.get(s.lesson)), s.completed, s.attempts, s.correct, rateText(s.attemptCorrectRate),
    ]), 6);
    fillTable('rptGroups', report.groups.map((g) => [
      groupName(g.group), g.completed, g.attempts, g.correct, rateText(g.attemptCorrectRate),
    ]), 5);
    fillTable('rptSeries', report.series.map((p) => [p.period, p.completions, p.attempts, p.correct]), 4);
    fillTable('rptLearners', report.learners.map((l) => [
      l.code, l.attempted, l.correctLessons, PASS_LABEL[l.quiz.status] || 'Không xác định',
    ]), 4);

    const hasActivity = report.series.length > 0 || report.lessons.some((s) => s.attempts > 0 || s.completed > 0);
    field('rptEmpty').classList.toggle('hidden', hasActivity);

    // Ghép trước–sau do máy chủ tính (FR-DSH-03); phần này không bị ảnh hưởng bởi bộ lọc.
    const { pairs, beforeAchieved, afterAchieved } = report.prePost;
    field('paired').textContent = pairs
      ? `Nhóm có đủ 5 nhiệm vụ ở cả hai lần đo: ${pairs} người. Đạt ≥3/5 trước học: ${beforeAchieved}/${pairs}; sau học: ${afterAchieved}/${pairs}. Dùng phiếu mới nhất mỗi lần đo.`
      : 'Chưa có nhóm đủ dữ liệu để đối chiếu trước–sau.';
  }

  // Phản hồi cũ (do lần đổi bộ lọc trước đó) bị bỏ qua để bảng luôn khớp bộ lọc hiện tại.
  async function refresh() {
    if (!ready) return;
    const filter = currentFilter();
    if (filter.from && filter.to && filter.from > filter.to) {
      status('Ngày bắt đầu không được sau ngày kết thúc.');
      return;
    }
    const seq = ++requestSeq;
    status('Đang tải báo cáo…');
    field('rptExport').disabled = true;
    try {
      const body = await api('dashboard?' + queryString(filter));
      if (seq !== requestSeq) return;
      lastReport = body.report;
      lastLegacy = { learners: body.learners || [], assessments: body.assessments || [] };
      render(body.report);
      status('Đã cập nhật lúc ' + new Date().toLocaleTimeString('vi-VN') + '.');
      field('rptExport').disabled = false;
    } catch (error) {
      if (seq !== requestSeq) return;
      status('Chưa tải được báo cáo: ' + error.message);
    }
  }

  // Chống công thức Excel: ô bắt đầu bằng = + @ - được thêm dấu nháy đơn; dấu " được nhân đôi.
  const csvQuote = (value) => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';

  function csvRows(report) {
    const f = report.filter;
    return [
      ['Báo cáo thống kê Sơn Trà Số'],
      ['Mốc múi giờ', 'Asia/Saigon (UTC+7)'],
      ['Từ (UTC)', f.from || 'Không giới hạn'],
      ['Đến (UTC)', f.to || 'Không giới hạn'],
      ['Nhóm', f.group ? groupName(f.group) : 'Tất cả'],
      ['Bài', f.lesson !== null ? lessonLabel(f.lesson) : 'Tất cả'],
      ['Kỳ', f.granularity === 'week' ? 'Theo tuần' : 'Theo ngày'],
      ['Ghi chú', 'Kiểm tra hiểu bài nội bộ; không thay thế đánh giá năng lực chính thức'],
      [],
      ['Bài học', 'Nhóm', 'Hoàn thành', 'Lượt làm', 'Lượt đúng', 'Tỷ lệ đúng (%)'],
      ...report.lessons.map((s) => [lessonLabel(s.lesson), groupName(lessonGroup.get(s.lesson)), s.completed, s.attempts, s.correct, s.attemptCorrectRate ?? '']),
      [],
      ['Nhóm bài', 'Hoàn thành', 'Lượt làm', 'Lượt đúng', 'Tỷ lệ đúng (%)'],
      ...report.groups.map((g) => [groupName(g.group), g.completed, g.attempts, g.correct, g.attemptCorrectRate ?? '']),
      [],
      ['Kỳ', 'Hoàn thành', 'Lượt làm', 'Lượt đúng'],
      ...report.series.map((p) => [p.period, p.completions, p.attempts, p.correct]),
      [],
      ['Mã học viên', 'Bài đã làm', 'Bài có lượt đúng', 'Trạng thái'],
      ...report.learners.map((l) => [l.code, l.attempted, l.correctLessons, PASS_LABEL[l.quiz.status] || '']),
      [],
      ['Tự học theo học viên (không chịu ảnh hưởng bộ lọc)'],
      ['Mã học viên', 'Đã đọc', 'Tự thực hành', 'Kiểm tra đạt', 'Lần làm bài kiểm tra (nội bộ)', 'Tỷ lệ đúng (nội bộ, %)', 'Cập nhật'],
      ...lastLegacy.learners.map((l) => [l.code, l.read || 0, l.done || 0, l.score || 0, l.quiz_attempts || 0, l.quiz_rate ?? '', l.updated || '']),
      [],
      ['Phiếu quan sát (không chịu ảnh hưởng bộ lọc)'],
      ['Mã học viên', 'Lần đo', 'Điểm 1', 'Điểm 2', 'Điểm 3', 'Điểm 4', 'Điểm 5', 'Người đánh giá', 'Thời điểm'],
      ...lastLegacy.assessments.map((a) => [a.code, a.phase, ...JSON.parse(a.scores).map((v) => v ?? ''), a.assessor, a.created]),
    ];
  }

  // FR-DSH-04: CSV UTF-8 có BOM để Excel tiếng Việt đọc đúng dấu.
  function exportCsv() {
    if (!lastReport) return;
    const body = csvRows(lastReport).map((row) => row.map(csvQuote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'son-tra-bao-cao.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function bind() {
    for (const id of ['rptFrom', 'rptTo', 'rptGroup', 'rptLesson', 'rptGranularity']) {
      field(id).addEventListener('change', refresh);
    }
    field('rptReset').addEventListener('click', () => {
      field('rptFrom').value = '';
      field('rptTo').value = '';
      field('rptGroup').value = '';
      field('rptLesson').value = '';
      field('rptGranularity').value = 'day';
      refresh();
    });
    field('rptExport').addEventListener('click', exportCsv);
    field('rptCompact').addEventListener('change', (event) => {
      field('reportSection').classList.toggle('compact', event.target.checked);
    });
  }

  // Bài đã ẩn không có trong danh mục công khai; quản trị lấy đủ mọi trang để báo cáo vẫn có tên.
  async function loadAllAdminLessons() {
    const first = await api('admin/lessons?page=1');
    const pages = [first];
    for (let p = 2; p <= first.pages; p += 1) pages.push(await api('admin/lessons?page=' + p));
    return pages.flatMap((page) => page.lessons);
  }

  async function init() {
    if (ready) return;
    try {
      const data = await api('lessons');
      groupNames = data.groups;
      for (const lesson of await loadAllAdminLessons()) {
        lessonNames.set(lesson.lesson, lesson.title);
        lessonGroup.set(lesson.lesson, lesson.group_no);
      }
      fillSelects();
      bind();
      ready = true;
      await refresh();
    } catch (error) {
      status('Chưa tải được danh mục bài: ' + error.message);
    }
  }

  window.SonTraReport = { init, refresh };
})();
