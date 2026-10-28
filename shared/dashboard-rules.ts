// Quy tắc báo cáo quản trị dùng chung (FR-DSH-01 đến 07; Mục 4.6, 4.7, 4.8 của CLAUDE.md).
// Module thuần: không truy vấn DB, không đọc môi trường. Route và kiểm thử đều dùng cùng một bản.
import { LESSON_COUNT, LESSON_MAX, LESSON_MIN } from './lesson-validation';

// Ngưỡng "đạt kiểm tra nội bộ" (phương án A đã duyệt): học viên đạt khi số bài có ít nhất một lượt đúng
// chiếm từ 70% trở lên trên tổng số bài. Đây là kiểm tra hiểu bài nội bộ, không phải đánh giá năng lực (quy tắc 4.7).
export const PASS_PERCENT = 70;

// Mốc ngày/tuần tính theo giờ Việt Nam (Asia/Saigon, UTC+7, không có giờ mùa hè).
// Dữ liệu lưu ISO 8601 UTC; chỉ đổi múi giờ khi gom nhóm, để một ngày báo cáo khớp ngày học thực tế.
export const REPORT_UTC_OFFSET_MINUTES = 7 * 60;

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const ACHIEVED_SKILL_SCORE = 3;
const SKILL_COUNT = 5;
const ACHIEVED_MIN_SKILLS = 3;

export type Granularity = 'day' | 'week';
export type PassStatus = 'dat' | 'chua_dat' | 'chua_co_du_lieu';

export const PASS_LABEL: Readonly<Record<PassStatus, string>> = {
  dat: 'Đạt kiểm tra nội bộ',
  chua_dat: 'Chưa đạt',
  chua_co_du_lieu: 'Chưa có dữ liệu',
};

export interface AttemptRow { learner: string; lesson: number; correct: number; created: string }
export interface CompletionRow { learner: string; lesson: number; completed_at: string | null }
export interface LessonStat {
  lesson: number;
  completed: number;
  attempts: number;
  correct: number;
  // Tỷ lệ đúng theo lượt làm, chỉ tham khảo. null khi chưa có lượt nào (FR-DSH-05: không quy thành 0).
  attemptCorrectRate: number | null;
}
export interface PeriodPoint { period: string; attempts: number; correct: number; completions: number }
export interface LearnerQuizResult { status: PassStatus; rate: number | null; attemptedLessons: number; correctLessons: number }
export interface AssessmentRow { code: string; phase: string; scores: (number | null)[]; created: string }
export interface PrePostPair { code: string; before: boolean; after: boolean }

// Chuỗi thời điểm hợp lệ theo ISO 8601 UTC. Giá trị khác bị loại khỏi chuỗi thời gian, không đoán mốc.
export function isIsoUtc(value: unknown): value is string {
  return typeof value === 'string' && ISO_UTC.test(value) && !Number.isNaN(Date.parse(value));
}

// Kết quả đạt của một học viên. Không có lượt làm nào thì trả chua_co_du_lieu và rate = null, không phải 0 (FR-DSH-05).
export function passStatus(correctLessons: number, attemptedLessons: number, totalLessons: number = LESSON_COUNT): LearnerQuizResult & { status: PassStatus } {
  const valid = (n: number) => Number.isInteger(n) && n >= 0;
  if (!valid(correctLessons) || !valid(attemptedLessons) || !Number.isInteger(totalLessons) || totalLessons <= 0) {
    throw new RangeError('Số bài phải là số nguyên không âm');
  }
  if (correctLessons > attemptedLessons || attemptedLessons > totalLessons) {
    throw new RangeError('Số bài đúng không được vượt số bài đã làm, và số bài đã làm không được vượt tổng số bài');
  }
  if (attemptedLessons === 0) {
    return { status: 'chua_co_du_lieu', rate: null, attemptedLessons, correctLessons };
  }
  // So sánh bằng số nguyên để tránh sai số dấu phẩy động quanh ngưỡng 70%.
  const passed = correctLessons * 100 >= PASS_PERCENT * totalLessons;
  return {
    status: passed ? 'dat' : 'chua_dat',
    rate: (correctLessons * 100) / totalLessons,
    attemptedLessons,
    correctLessons,
  };
}

// Tổng hợp theo từng học viên: mỗi bài tính một lần, dù làm nhiều lượt (chỉ cần một lượt đúng).
export function learnerQuizResults(attempts: AttemptRow[]): Map<string, LearnerQuizResult & { status: PassStatus }> {
  const perLearner = new Map<string, { attempted: Set<number>; correct: Set<number> }>();
  for (const row of attempts) {
    if (!inLessonRange(row.lesson)) continue;
    const entry = perLearner.get(row.learner) ?? { attempted: new Set<number>(), correct: new Set<number>() };
    entry.attempted.add(row.lesson);
    if (row.correct === 1) entry.correct.add(row.lesson);
    perLearner.set(row.learner, entry);
  }
  const results = new Map<string, LearnerQuizResult & { status: PassStatus }>();
  for (const [learner, entry] of perLearner) {
    results.set(learner, passStatus(entry.correct.size, entry.attempted.size));
  }
  return results;
}

function inLessonRange(lesson: number): boolean {
  return Number.isInteger(lesson) && lesson >= LESSON_MIN && lesson <= LESSON_MAX;
}

// Thống kê theo bài. Bài chưa có lượt làm có attemptCorrectRate = null, không phải 0.
export function lessonStats(attempts: AttemptRow[], completions: CompletionRow[]): LessonStat[] {
  const stats: LessonStat[] = [];
  for (let lesson = LESSON_MIN; lesson <= LESSON_MAX; lesson++) {
    const lessonAttempts = attempts.filter((row) => row.lesson === lesson);
    const attemptCount = lessonAttempts.length;
    const correct = lessonAttempts.filter((row) => row.correct === 1).length;
    stats.push({
      lesson,
      completed: completions.filter((row) => row.lesson === lesson).length,
      attempts: attemptCount,
      correct,
      attemptCorrectRate: attemptCount === 0 ? null : (correct * 100) / attemptCount,
    });
  }
  return stats;
}

// Gom theo nhóm bài (group_no 1–5). groupOf lấy từ bảng lessons, không hard-code tại đây.
export function groupStats(stats: LessonStat[], groupOf: (lesson: number) => number): Map<number, Omit<LessonStat, 'lesson'>> {
  const groups = new Map<number, { completed: number; attempts: number; correct: number }>();
  for (const stat of stats) {
    const group = groupOf(stat.lesson);
    const entry = groups.get(group) ?? { completed: 0, attempts: 0, correct: 0 };
    entry.completed += stat.completed;
    entry.attempts += stat.attempts;
    entry.correct += stat.correct;
    groups.set(group, entry);
  }
  const result = new Map<number, Omit<LessonStat, 'lesson'>>();
  for (const [group, entry] of groups) {
    result.set(group, {
      ...entry,
      attemptCorrectRate: entry.attempts === 0 ? null : (entry.correct * 100) / entry.attempts,
    });
  }
  return result;
}

// Ngày báo cáo theo giờ Việt Nam. Trả null nếu thời điểm không hợp lệ.
export function periodKey(iso: unknown, granularity: Granularity): string | null {
  if (!isIsoUtc(iso)) return null;
  const local = new Date(Date.parse(iso) + REPORT_UTC_OFFSET_MINUTES * 60_000);
  if (granularity === 'day') return local.toISOString().slice(0, 10);
  return isoWeekKey(local);
}

// Tuần ISO 8601 (thứ Hai là ngày đầu tuần). Tuần thuộc năm chứa thứ Năm của tuần đó.
function isoWeekKey(local: Date): string {
  const weekday = ((local.getUTCDay() + 6) % 7) + 1; // Thứ Hai = 1, Chủ nhật = 7
  const thursday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (4 - weekday)));
  const year = thursday.getUTCFullYear();
  const dayOfYear = Math.round((thursday.getTime() - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
  const week = Math.floor((dayOfYear - 1) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// Chuỗi thời gian. Lượt làm dùng mốc created; hoàn thành dùng completed_at (không dùng progress.updated,
// vì mốc này bị ghi đè mỗi lần đồng bộ). Mốc không hợp lệ bị bỏ khỏi chuỗi nhưng vẫn có trong tổng.
export function periodSeries(attempts: AttemptRow[], completions: CompletionRow[], granularity: Granularity): PeriodPoint[] {
  const points = new Map<string, PeriodPoint>();
  const at = (period: string) => {
    const point = points.get(period) ?? { period, attempts: 0, correct: 0, completions: 0 };
    points.set(period, point);
    return point;
  };
  for (const row of attempts) {
    const period = periodKey(row.created, granularity);
    if (period === null) continue;
    const point = at(period);
    point.attempts += 1;
    if (row.correct === 1) point.correct += 1;
  }
  for (const row of completions) {
    const period = periodKey(row.completed_at, granularity);
    if (period === null) continue;
    at(period).completions += 1;
  }
  return [...points.values()].sort((x, y) => (x.period < y.period ? -1 : x.period > y.period ? 1 : 0));
}

// Số kỹ năng đạt mức 3 trong một phiếu. Phiếu chưa đủ 5 nhiệm vụ trả null, không suy ra thành 0.
export function achievedSkillCount(scores: (number | null)[]): number | null {
  if (scores.length !== SKILL_COUNT || scores.some((score) => score === null)) return null;
  return scores.filter((score) => score === ACHIEVED_SKILL_SCORE).length;
}

// Đối chiếu trước–sau (FR-DSH-03): lấy phiếu mới nhất cho mỗi (mã học viên, giai đoạn);
// chỉ đưa vào nhóm khi cả hai lần đo đều đủ 5 nhiệm vụ.
export function pairPrePost(rows: AssessmentRow[], beforePhase = 'Trước học', afterPhase = 'Sau học'): PrePostPair[] {
  const latest = new Map<string, AssessmentRow>();
  for (const row of rows) {
    if (!isIsoUtc(row.created)) continue;
    const key = `${row.code}\u0000${row.phase}`;
    const current = latest.get(key);
    if (!current || Date.parse(row.created) > Date.parse(current.created)) latest.set(key, row);
  }
  const codes = new Set([...latest.values()].map((row) => row.code));
  const pairs: PrePostPair[] = [];
  for (const code of codes) {
    const before = latest.get(`${code}\u0000${beforePhase}`);
    const after = latest.get(`${code}\u0000${afterPhase}`);
    if (!before || !after) continue;
    const beforeCount = achievedSkillCount(before.scores);
    const afterCount = achievedSkillCount(after.scores);
    if (beforeCount === null || afterCount === null) continue;
    pairs.push({
      code,
      before: beforeCount >= ACHIEVED_MIN_SKILLS,
      after: afterCount >= ACHIEVED_MIN_SKILLS,
    });
  }
  return pairs.sort((x, y) => (x.code < y.code ? -1 : x.code > y.code ? 1 : 0));
}

// Lọc theo khoảng thời gian (từ, đến dạng ISO UTC, bao gồm hai đầu). Mốc không hợp lệ bị loại.
export function inPeriod(iso: unknown, from: string | null, to: string | null): boolean {
  if (!isIsoUtc(iso)) return false;
  const time = Date.parse(iso);
  if (from !== null && time < Date.parse(from)) return false;
  if (to !== null && time > Date.parse(to)) return false;
  return true;
}

// Các hàm dưới đây nhận dữ liệu đã gom sẵn trong SQL (xem shared/dashboard-queries.ts), để không tải từng lượt làm vào bộ nhớ.
// Logic ngưỡng và tuần ISO vẫn chỉ có một bản, dùng chung với các hàm ở trên.

export interface LessonCount { lesson: number; attempts: number; correct: number }
export interface LessonCompletion { lesson: number; completed: number }
export interface DailyAttempt { day: string; attempts: number; correct: number }
export interface DailyCompletion { day: string; completions: number }

// Ngày địa phương dạng YYYY-MM-DD (đã cộng múi giờ ở tầng truy vấn) sang khóa kỳ báo cáo.
export function periodKeyFromLocalDay(day: string, granularity: Granularity): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const midnight = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(midnight)) return null;
  if (granularity === 'day') return day;
  return isoWeekKey(new Date(midnight));
}

// Chuỗi thời gian từ dữ liệu đã gom theo ngày. Kết quả phải khớp với periodSeries trên cùng dữ liệu gốc (được kiểm thử).
export function seriesFromDaily(attempts: DailyAttempt[], completions: DailyCompletion[], granularity: Granularity): PeriodPoint[] {
  const points = new Map<string, PeriodPoint>();
  const at = (period: string) => {
    const point = points.get(period) ?? { period, attempts: 0, correct: 0, completions: 0 };
    points.set(period, point);
    return point;
  };
  for (const row of attempts) {
    const period = periodKeyFromLocalDay(row.day, granularity);
    if (period === null) continue;
    const point = at(period);
    point.attempts += row.attempts;
    point.correct += row.correct;
  }
  for (const row of completions) {
    const period = periodKeyFromLocalDay(row.day, granularity);
    if (period === null) continue;
    at(period).completions += row.completions;
  }
  return [...points.values()].sort((x, y) => (x.period < y.period ? -1 : x.period > y.period ? 1 : 0));
}

// Thống kê theo bài từ số đếm đã gom. Bài không có lượt làm có attemptCorrectRate = null.
export function lessonStatsFromCounts(attempts: LessonCount[], completions: LessonCompletion[]): LessonStat[] {
  const stats: LessonStat[] = [];
  for (let lesson = LESSON_MIN; lesson <= LESSON_MAX; lesson++) {
    const a = attempts.find((row) => row.lesson === lesson);
    const attemptCount = a?.attempts ?? 0;
    const correct = a?.correct ?? 0;
    stats.push({
      lesson,
      completed: completions.find((row) => row.lesson === lesson)?.completed ?? 0,
      attempts: attemptCount,
      correct,
      attemptCorrectRate: attemptCount === 0 ? null : (correct * 100) / attemptCount,
    });
  }
  return stats;
}
