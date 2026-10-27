import assert from 'node:assert/strict';
import { loadShared } from './route-harness.mjs';

// Kiểm thử đơn vị cho shared/dashboard-rules (Bước 2 của báo cáo quản trị).
// Mỗi quy tắc nghiệp vụ được kiểm bằng ít nhất một ca: ngưỡng 70%, không quy chưa đánh giá thành 0,
// mốc thời gian completed_at và created, tuần ISO, ghép trước–sau theo phiếu mới nhất.
const rules = await loadShared('dashboard-rules');

// 1) Ngưỡng đạt theo phương án A: tính trên 10 bài, đạt khi ≥ 70% (tức ≥ 7 bài có ít nhất một lượt đúng).
{
  assert.deepEqual(rules.passStatus(0, 0), { status: 'chua_co_du_lieu', rate: null, attemptedLessons: 0, correctLessons: 0 }, 'chưa làm bài: không có dữ liệu, rate null (FR-DSH-05)');
  assert.equal(rules.passStatus(0, 1).status, 'chua_dat');
  assert.equal(rules.passStatus(6, 10).status, 'chua_dat', '6/10 = 60% chưa đạt');
  assert.equal(rules.passStatus(7, 10).status, 'dat', '7/10 = 70% đạt đúng ngưỡng');
  assert.equal(rules.passStatus(7, 10).rate, 70);
  assert.equal(rules.passStatus(10, 10).status, 'dat');
  assert.equal(rules.passStatus(3, 3).status, 'chua_dat', '3/3 bài đã làm nhưng chỉ 30% tổng số bài: chưa đạt');
  assert.equal(rules.PASS_PERCENT, 70);
  assert.equal(rules.PASS_LABEL.dat, 'Đạt kiểm tra nội bộ', 'nhãn phải ghi rõ là kiểm tra nội bộ');
}

// 2) Đầu vào sai bị từ chối bằng lỗi, không trả kết quả đoán.
{
  assert.throws(() => rules.passStatus(-1, 0), RangeError);
  assert.throws(() => rules.passStatus(2, 1), RangeError, 'số bài đúng không được vượt số bài đã làm');
  assert.throws(() => rules.passStatus(1, 11), RangeError, 'số bài đã làm không được vượt 10');
  assert.throws(() => rules.passStatus(1.5, 2), RangeError);
}

// 3) Theo học viên: mỗi bài đếm một lần dù làm nhiều lượt; bài chỉ làm sai vẫn tính là đã làm nhưng không đúng.
{
  const attempts = [
    { learner: 'A', lesson: 0, correct: 0, created: '2026-10-01T01:00:00Z' },
    { learner: 'A', lesson: 0, correct: 1, created: '2026-10-01T01:05:00Z' },
    { learner: 'A', lesson: 1, correct: 0, created: '2026-10-01T01:10:00Z' },
    ...[2, 3, 4, 5, 6, 7].map((lesson) => ({ learner: 'A', lesson, correct: 1, created: '2026-10-02T01:00:00Z' })),
    { learner: 'B', lesson: 9, correct: 1, created: '2026-10-02T02:00:00Z' },
    { learner: 'B', lesson: 42, correct: 1, created: '2026-10-02T02:00:00Z' },
  ];
  const results = rules.learnerQuizResults(attempts);
  assert.equal(results.get('A').attemptedLessons, 8, 'bài 0 đếm một lần dù có hai lượt');
  assert.equal(results.get('A').correctLessons, 7);
  assert.equal(results.get('A').status, 'dat', '7/10 bài có lượt đúng là đạt');
  assert.equal(results.get('B').correctLessons, 1, 'lesson 42 ngoài 0–9 bị bỏ qua');
  assert.equal(results.get('B').status, 'chua_dat');
  assert.equal(results.has('C'), false, 'học viên không có lượt làm không có kết quả');
}

// 4) Thống kê theo bài: tỷ lệ đúng theo lượt là null khi chưa có lượt, không phải 0 (FR-DSH-05).
{
  const attempts = [
    { learner: 'A', lesson: 0, correct: 1, created: '2026-10-01T01:00:00Z' },
    { learner: 'B', lesson: 0, correct: 0, created: '2026-10-01T02:00:00Z' },
  ];
  const completions = [
    { learner: 'A', lesson: 0, completed_at: '2026-10-01T03:00:00Z' },
    { learner: 'B', lesson: 0, completed_at: null },
    { learner: 'A', lesson: 3, completed_at: '2026-10-01T03:00:00Z' },
  ];
  const stats = rules.lessonStats(attempts, completions);
  assert.equal(stats.length, 10);
  assert.deepEqual(stats[0], { lesson: 0, completed: 2, attempts: 2, correct: 1, attemptCorrectRate: 50 });
  assert.equal(stats[5].attemptCorrectRate, null, 'bài chưa có lượt làm: tỷ lệ null');
  assert.equal(stats[3].completed, 1);
}

// 5) Gom theo nhóm bài: tổng cộng đúng; nhóm không có lượt làm có tỷ lệ null.
{
  const stats = rules.lessonStats(
    [{ learner: 'A', lesson: 0, correct: 1, created: '2026-10-01T01:00:00Z' }, { learner: 'A', lesson: 1, correct: 0, created: '2026-10-01T01:00:00Z' }],
    [],
  );
  const groups = rules.groupStats(stats, (lesson) => (lesson < 2 ? 1 : 2));
  assert.equal(groups.get(1).attempts, 2);
  assert.equal(groups.get(1).attemptCorrectRate, 50);
  assert.equal(groups.get(2).attemptCorrectRate, null);
}

// 6) Mốc ngày theo giờ Việt Nam: 17:00 UTC là 00:00 ngày kế tiếp (UTC+7).
{
  assert.equal(rules.periodKey('2026-10-26T16:59:59Z', 'day'), '2026-10-26');
  assert.equal(rules.periodKey('2026-10-26T17:00:00Z', 'day'), '2026-10-27');
  assert.equal(rules.periodKey('not-a-date', 'day'), null, 'mốc không hợp lệ trả null');
  assert.equal(rules.periodKey('2026-10-27 10:00:00', 'day'), null, 'thiếu hậu tố Z không phải ISO UTC');
}

// 7) Tuần ISO 8601: thứ Hai đầu tuần; tuần 1 của năm chứa thứ Năm đầu tiên; 2026 có 53 tuần.
{
  assert.equal(rules.periodKey('2025-12-29T00:00:00Z', 'week'), '2026-W01', 'thứ Hai 29/12/2025 (giờ VN) thuộc 2026-W01');
  assert.equal(rules.periodKey('2027-01-01T10:00:00Z', 'week'), '2026-W53', 'thứ Sáu 01/01/2027 thuộc 2026-W53');
  assert.equal(rules.periodKey('2026-10-27T03:00:00Z', 'week'), rules.periodKey('2026-10-26T20:00:00Z', 'week'), 'cùng tuần ISO');
}

// 8) Chuỗi thời gian: lượt làm theo created; hoàn thành theo completed_at, bỏ qua mốc rỗng.
{
  const attempts = [
    { learner: 'A', lesson: 0, correct: 1, created: '2026-10-27T01:00:00Z' },
    { learner: 'A', lesson: 1, correct: 0, created: '2026-10-26T01:00:00Z' },
    { learner: 'B', lesson: 0, correct: 1, created: 'sai-dinh-dang' },
  ];
  const completions = [
    { learner: 'A', lesson: 0, completed_at: '2026-10-27T02:00:00Z' },
    { learner: 'B', lesson: 0, completed_at: null },
  ];
  const series = rules.periodSeries(attempts, completions, 'day');
  assert.deepEqual(series, [
    { period: '2026-10-26', attempts: 1, correct: 0, completions: 0 },
    { period: '2026-10-27', attempts: 1, correct: 1, completions: 1 },
  ], 'sắp xếp tăng dần, bỏ mốc không hợp lệ');
}

// 9) Số kỹ năng đạt mức 3: phiếu thiếu nhiệm vụ không được coi là 0.
{
  assert.equal(rules.achievedSkillCount([3, 3, 3, 0, 0]), 3);
  assert.equal(rules.achievedSkillCount([3, 3, null, 0, 0]), null, 'có nhiệm vụ chưa đánh giá: null');
  assert.equal(rules.achievedSkillCount([3, 3, 3]), null, 'chưa đủ 5 nhiệm vụ: null');
}

// 10) Ghép trước–sau (FR-DSH-03): phiếu mới nhất theo giai đoạn; chỉ đưa vào nhóm khi cả hai lần đủ 5 nhiệm vụ.
{
  const rows = [
    { code: 'A', phase: 'Trước học', scores: [0, 0, 0, 0, 0], created: '2026-10-01T00:00:00Z' },
    { code: 'A', phase: 'Trước học', scores: [3, 3, 3, 0, 0], created: '2026-10-02T00:00:00Z' },
    { code: 'A', phase: 'Sau học', scores: [3, 3, 0, 0, 0], created: '2026-10-05T00:00:00Z' },
    { code: 'B', phase: 'Trước học', scores: [3, 3, 3, 3, 3], created: '2026-10-01T00:00:00Z' },
    { code: 'C', phase: 'Trước học', scores: [3, 3, 3, 3, 3], created: '2026-10-01T00:00:00Z' },
    { code: 'C', phase: 'Sau học', scores: [3, null, 3, 3, 3], created: '2026-10-05T00:00:00Z' },
    { code: 'D', phase: 'Trước học', scores: [3, 3, 3, 3, 3], created: 'sai-dinh-dang' },
    { code: 'D', phase: 'Sau học', scores: [3, 3, 3, 3, 3], created: '2026-10-05T00:00:00Z' },
  ];
  assert.deepEqual(rules.pairPrePost(rows), [{ code: 'A', before: true, after: false }], 'A dùng phiếu trước mới nhất (3 kỹ năng đạt); B thiếu sau học; C có nhiệm vụ null; D có mốc lỗi');
}

// 11) Lọc theo khoảng thời gian: hai đầu bao gồm; mốc không hợp lệ bị loại.
{
  assert.equal(rules.inPeriod('2026-10-27T00:00:00Z', '2026-10-27T00:00:00Z', null), true);
  assert.equal(rules.inPeriod('2026-10-26T23:59:59Z', '2026-10-27T00:00:00Z', null), false);
  assert.equal(rules.inPeriod('2026-10-27T00:00:00Z', null, '2026-10-27T00:00:00Z'), true);
  assert.equal(rules.inPeriod('bad', null, null), false);
}

console.log('PASS: báo cáo quản trị (đơn vị): ngưỡng 70% theo phương án A, không quy chưa đánh giá thành 0, mốc completed_at và created theo giờ Việt Nam, tuần ISO, ghép trước–sau theo phiếu mới nhất, lọc khoảng thời gian');
