// Truy vấn báo cáo quản trị (Bước 3; FR-DSH-01 đến 06; NFR-PERF-03: 500 học viên, dưới 1 giây).
// Chỉ dùng cú pháp SQL chuẩn để chạy trên cả D1 và SQLite: strftime, COUNT, SUM, COUNT(DISTINCT ...),
// CASE, GROUP BY trên truy vấn con. Không dùng hàm riêng của một engine.
// Mốc thời gian lưu theo toISOString() (có mili giây, kết thúc bằng Z), nên so sánh chuỗi đúng thứ tự.
// Gom nhóm nằm trong SQL để không tải từng lượt làm vào bộ nhớ khi số lượt tăng.
import {
  REPORT_UTC_OFFSET_MINUTES,
  groupStats,
  isIsoUtc,
  lessonStatsFromCounts,
  pairPrePost,
  passStatus,
  seriesFromDaily,
  type AssessmentRow,
  type DailyAttempt,
  type DailyCompletion,
  type Granularity,
  type LessonCompletion,
  type LessonCount,
  type LessonStat,
  type PeriodPoint,
} from './dashboard-rules';
import { GROUP_MAX, GROUP_MIN, LESSON_MAX, LESSON_MIN } from './lesson-validation';

// Giao diện tối thiểu, khớp với prepare/bind/all của D1 (CLAUDE.md mục 3).
export interface Statement {
  bind(...values: unknown[]): Statement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}
export interface Db {
  prepare(query: string): Statement;
}

export interface ReportFilter {
  from: string | null;
  to: string | null;
  lesson: number | null;
  group: number | null;
  granularity: Granularity;
}

export interface LearnerReport {
  code: string;
  attempted: number;
  correctLessons: number;
  quiz: ReturnType<typeof passStatus>;
}

export interface DashboardSnapshot {
  filter: ReportFilter;
  learners: LearnerReport[];
  lessons: LessonStat[];
  groups: Array<{ group: number } & Omit<LessonStat, 'lesson'>>;
  series: PeriodPoint[];
  prePost: { pairs: number; beforeAchieved: number; afterAchieved: number };
}

// Modifier múi giờ dạng tham số (không ghép chuỗi SQL). Ví dụ: "+420 minutes".
const OFFSET_MODIFIER = `${REPORT_UTC_OFFSET_MINUTES >= 0 ? '+' : ''}${REPORT_UTC_OFFSET_MINUTES} minutes`;

// Kiểm tra và chuẩn hóa bộ lọc. Đầu vào sai bị từ chối bằng lỗi, không im lặng bỏ qua.
export function normalizeFilter(input: Partial<ReportFilter> = {}): ReportFilter {
  const canonical = (value: unknown, label: string): string | null => {
    if (value === null || value === undefined) return null;
    if (!isIsoUtc(value)) throw new RangeError(`${label} phải là ISO 8601 UTC`);
    return new Date(Date.parse(value)).toISOString();
  };
  const from = canonical(input.from, 'Từ ngày');
  const to = canonical(input.to, 'Đến ngày');
  if (from !== null && to !== null && from > to) throw new RangeError('Ngày bắt đầu không được sau ngày kết thúc');
  const lesson = input.lesson ?? null;
  if (lesson !== null && (!Number.isInteger(lesson) || lesson < LESSON_MIN || lesson > LESSON_MAX)) {
    throw new RangeError('Bài học phải nằm trong 0–9');
  }
  const group = input.group ?? null;
  if (group !== null && (!Number.isInteger(group) || group < GROUP_MIN || group > GROUP_MAX)) {
    throw new RangeError('Nhóm phải nằm trong 1–5');
  }
  const granularity = input.granularity ?? 'day';
  if (granularity !== 'day' && granularity !== 'week') throw new RangeError('Kỳ phải là day hoặc week');
  return { from, to, lesson, group, granularity };
}

// Chuyển tham số truy vấn URL thành bộ lọc (FR-DSH-04). Tham số rỗng nghĩa là không lọc.
// Số sai định dạng (ví dụ "abc", "-1") không được ép thành 0: trả NaN để normalizeFilter từ chối.
// Granularity được ép kiểu ở đây nhưng vẫn do normalizeFilter kiểm tra lại giá trị.
export function filterFromSearchParams(params: URLSearchParams): Partial<ReportFilter> {
  const text = (key: string): string | null => {
    const value = params.get(key)?.trim() ?? '';
    return value === '' ? null : value;
  };
  const integer = (key: string): number | null => {
    const value = text(key);
    if (value === null) return null;
    return /^\d+$/.test(value) ? Number(value) : Number.NaN;
  };
  return {
    from: text('from'),
    to: text('to'),
    lesson: integer('lesson'),
    group: integer('group'),
    granularity: (text('granularity') ?? 'day') as Granularity,
  };
}

interface Clause { sql: string; values: unknown[] }

// Khoảng thời gian trên một cột mốc (created hoặc completed_at). Hai đầu bao gồm.
function timeClause(column: string, filter: ReportFilter): Clause {
  const parts: string[] = [];
  const values: unknown[] = [];
  if (filter.from !== null) { parts.push(` AND ${column} >= ?`); values.push(filter.from); }
  if (filter.to !== null) { parts.push(` AND ${column} <= ?`); values.push(filter.to); }
  return { sql: parts.join(''), values };
}

// Phạm vi theo bài hoặc nhóm bài. Nhóm được lấy qua truy vấn con trên bảng lessons.
function lessonClause(filter: ReportFilter): Clause {
  const parts: string[] = [];
  const values: unknown[] = [];
  if (filter.lesson !== null) { parts.push(' AND lesson = ?'); values.push(filter.lesson); }
  if (filter.group !== null) {
    parts.push(' AND lesson IN (SELECT lesson FROM lessons WHERE group_no = ?)');
    values.push(filter.group);
  }
  return { sql: parts.join(''), values };
}

async function run<T>(db: Db, sql: string, values: unknown[]): Promise<T[]> {
  const { results } = await db.prepare(sql).bind(...values).all<T>();
  return results;
}

// Lượt làm theo bài: tổng số và số lượt đúng.
export async function queryLessonAttempts(db: Db, filter: ReportFilter): Promise<LessonCount[]> {
  const t = timeClause('created', filter);
  const s = lessonClause(filter);
  const rows = await run<{ lesson: number; attempts: number; correct: number | null }>(
    db,
    `SELECT lesson, COUNT(*) AS attempts, SUM(correct) AS correct FROM quiz_attempts WHERE 1 = 1${t.sql}${s.sql} GROUP BY lesson`,
    [...t.values, ...s.values],
  );
  return rows.map((row) => ({ lesson: Number(row.lesson), attempts: Number(row.attempts), correct: Number(row.correct ?? 0) }));
}

// Hoàn thành theo bài (done = 1). Khi có khoảng thời gian, dòng không có completed_at bị loại.
export async function queryLessonCompletions(db: Db, filter: ReportFilter): Promise<LessonCompletion[]> {
  const t = timeClause('completed_at', filter);
  const s = lessonClause(filter);
  const rows = await run<{ lesson: number; completed: number }>(
    db,
    `SELECT lesson, COUNT(*) AS completed FROM progress WHERE done = 1${t.sql}${s.sql} GROUP BY lesson`,
    [...t.values, ...s.values],
  );
  return rows.map((row) => ({ lesson: Number(row.lesson), completed: Number(row.completed) }));
}

// Lượt làm theo ngày địa phương (múi giờ báo cáo). Ngày null (mốc hỏng) được bỏ ở tầng JavaScript.
export async function queryDailyAttempts(db: Db, filter: ReportFilter): Promise<DailyAttempt[]> {
  const t = timeClause('created', filter);
  const s = lessonClause(filter);
  const rows = await run<{ day: string | null; attempts: number; correct: number | null }>(
    db,
    `SELECT day, COUNT(*) AS attempts, SUM(correct) AS correct FROM (` +
      `SELECT strftime('%Y-%m-%d', created, ?) AS day, correct FROM quiz_attempts WHERE 1 = 1${t.sql}${s.sql}` +
      `) GROUP BY day`,
    [OFFSET_MODIFIER, ...t.values, ...s.values],
  );
  return rows
    .filter((row): row is typeof row & { day: string } => row.day !== null)
    .map((row) => ({ day: row.day, attempts: Number(row.attempts), correct: Number(row.correct ?? 0) }));
}

// Hoàn thành theo ngày địa phương, dùng completed_at làm mốc (không dùng progress.updated).
export async function queryDailyCompletions(db: Db, filter: ReportFilter): Promise<DailyCompletion[]> {
  const t = timeClause('completed_at', filter);
  const s = lessonClause(filter);
  const rows = await run<{ day: string | null; completions: number }>(
    db,
    `SELECT day, COUNT(*) AS completions FROM (` +
      `SELECT strftime('%Y-%m-%d', completed_at, ?) AS day FROM progress WHERE done = 1 AND completed_at IS NOT NULL${t.sql}${s.sql}` +
      `) GROUP BY day`,
    [OFFSET_MODIFIER, ...t.values, ...s.values],
  );
  return rows
    .filter((row): row is typeof row & { day: string } => row.day !== null)
    .map((row) => ({ day: row.day, completions: Number(row.completions) }));
}

// Kết quả kiểm tra theo học viên: số bài đã làm và số bài có ít nhất một lượt đúng.
// Phạm vi: khoảng thời gian. Không áp bộ lọc bài hoặc nhóm, vì ngưỡng đạt tính trên toàn bộ 10 bài.
async function queryLearnerAttempts(db: Db, filter: ReportFilter): Promise<Array<{ learner: string; attempted: number; correct_lessons: number }>> {
  const t = timeClause('created', filter);
  const rows = await run<{ learner: string; attempted: number; correct_lessons: number | null }>(
    db,
    `SELECT learner, COUNT(DISTINCT lesson) AS attempted, COUNT(DISTINCT CASE WHEN correct = 1 THEN lesson END) AS correct_lessons ` +
      `FROM quiz_attempts WHERE 1 = 1${t.sql} GROUP BY learner`,
    t.values,
  );
  return rows.map((row) => ({
    learner: row.learner,
    attempted: Number(row.attempted),
    correct_lessons: Number(row.correct_lessons ?? 0),
  }));
}

// Danh sách học viên (kể cả chưa làm bài kiểm tra).
async function queryLearners(db: Db): Promise<Array<{ id: string; code: string }>> {
  return run<{ id: string; code: string }>(db, 'SELECT id, code FROM learners ORDER BY created DESC, code', []);
}

// Phiếu quan sát kèm mã học viên, dùng cho đối chiếu trước–sau (không áp khoảng thời gian).
async function queryAssessments(db: Db): Promise<AssessmentRow[]> {
  const rows = await run<{ code: string; phase: string; scores: string; created: string }>(
    db,
    'SELECT l.code AS code, a.phase AS phase, a.scores AS scores, a.created AS created FROM assessments a JOIN learners l ON l.id = a.learner',
    [],
  );
  return rows.map((row) => ({ code: row.code, phase: row.phase, scores: parseScores(row.scores), created: row.created }));
}

// Điểm kỹ năng là mảng JSON gồm số hoặc null. Dữ liệu hỏng trả mảng rỗng, phiếu đó sẽ bị loại khỏi đối chiếu.
function parseScores(raw: string): (number | null)[] {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.map((item) => (typeof item === 'number' ? item : null));
  } catch {
    return [];
  }
}

async function queryLessonGroups(db: Db): Promise<Array<{ lesson: number; group_no: number }>> {
  return run<{ lesson: number; group_no: number }>(db, 'SELECT lesson, group_no FROM lessons ORDER BY lesson', []);
}

// Tập hợp toàn bộ số liệu báo cáo cho một bộ lọc. Các hàm thuần trong dashboard-rules quyết định ngưỡng và nhãn.
export async function loadDashboardSnapshot(db: Db, input: Partial<ReportFilter> = {}): Promise<DashboardSnapshot> {
  const filter = normalizeFilter(input);
  const [attempts, completions, dailyAttempts, dailyCompletions, learnerAgg, learners, assessments, groupRows] = await Promise.all([
    queryLessonAttempts(db, filter),
    queryLessonCompletions(db, filter),
    queryDailyAttempts(db, filter),
    queryDailyCompletions(db, filter),
    queryLearnerAttempts(db, filter),
    queryLearners(db),
    queryAssessments(db),
    queryLessonGroups(db),
  ]);

  const aggByLearner = new Map(learnerAgg.map((row) => [row.learner, row]));
  const learnerReports: LearnerReport[] = learners.map((learner) => {
    const agg = aggByLearner.get(learner.id);
    const attempted = agg?.attempted ?? 0;
    const correctLessons = agg?.correct_lessons ?? 0;
    return { code: learner.code, attempted, correctLessons, quiz: passStatus(correctLessons, attempted) };
  });

  const groupOf = new Map(groupRows.map((row) => [Number(row.lesson), Number(row.group_no)]));
  let lessons = lessonStatsFromCounts(attempts, completions);
  if (filter.lesson !== null) lessons = lessons.filter((stat) => stat.lesson === filter.lesson);
  if (filter.group !== null) lessons = lessons.filter((stat) => groupOf.get(stat.lesson) === filter.group);
  const groups = [...groupStats(lessons, (lesson) => groupOf.get(lesson) ?? 0)]
    .map(([group, value]) => ({ group, ...value }))
    .sort((x, y) => x.group - y.group);

  const series = seriesFromDaily(dailyAttempts, dailyCompletions, filter.granularity);
  const pairs = pairPrePost(assessments);

  return {
    filter,
    learners: learnerReports,
    lessons,
    groups,
    series,
    prePost: {
      pairs: pairs.length,
      beforeAchieved: pairs.filter((pair) => pair.before).length,
      afterAchieved: pairs.filter((pair) => pair.after).length,
    },
  };
}
