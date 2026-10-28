// Tổng hợp cũ của khối đầu trang quản trị: học viên, phiếu quan sát và danh sách tình nguyện viên.
// Chuyển từ app/api/[...path]/route.ts sang đây để route không chứa truy vấn SQL (CLAUDE.md mục 3).
// Giữ nguyên câu SQL và hình dạng dữ liệu để giao diện hiện tại không đổi.
// Khi giao diện chuyển hết sang "report" của /api/dashboard, khối này có thể bỏ.
import { correctRate } from './quiz-rules';

// Giao diện tối thiểu khớp prepare/all của D1 và của adapter kiểm thử.
export interface SummaryStatement {
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}
export interface SummaryDb {
  prepare(query: string): SummaryStatement;
}

export interface SummaryLearnerRow {
  code: string;
  created: string;
  lessons: number;
  read: number | null;
  done: number | null;
  score: number | null;
  updated: string | null;
  quiz_attempts: number;
  quiz_correct: number;
}
export interface SummaryLearner extends SummaryLearnerRow {
  quiz_rate: number | null;
}
export interface SummaryAssessment {
  id: string;
  code: string;
  phase: string;
  scores: string;
  assessor: string;
  created: string;
}
export interface DashboardSummary {
  learners: SummaryLearner[];
  assessments: SummaryAssessment[];
  staff: Array<{ email: string }>;
}

// Số lần làm bài và tỷ lệ đúng là số liệu "kiểm tra hiểu bài nội bộ", không phải đánh giá năng lực (Mục 2, quyết định 4).
// Dùng truy vấn con để không nhân đôi dòng khi JOIN với progress.
const LEARNER_SQL =
  'SELECT l.code,l.created,COUNT(p.lesson) AS lessons,SUM(p.read) AS read,SUM(p.done) AS done,SUM(p.score) AS score,MAX(p.updated) AS updated,(SELECT COUNT(*) FROM quiz_attempts q WHERE q.learner=l.id) AS quiz_attempts,(SELECT COALESCE(SUM(q.correct),0) FROM quiz_attempts q WHERE q.learner=l.id) AS quiz_correct FROM learners l LEFT JOIN progress p ON l.id=p.learner GROUP BY l.id ORDER BY l.created DESC';
const ASSESSMENT_SQL =
  'SELECT a.id,l.code,a.phase,a.scores,a.assessor,a.created FROM assessments a JOIN learners l ON l.id=a.learner ORDER BY a.created DESC';
const STAFF_SQL = 'SELECT email FROM staff ORDER BY email';

// Đọc ba nguồn trong một lượt; lỗi truy vấn được ném lên để route trả 503.
export async function loadDashboardSummary(db: SummaryDb): Promise<DashboardSummary> {
  const learnerRows = (await db.prepare(LEARNER_SQL).all<SummaryLearnerRow>()).results;
  const learners = learnerRows.map((row) => ({
    ...row,
    quiz_rate: correctRate(Number(row.quiz_attempts), Number(row.quiz_correct)),
  }));
  const assessments = (await db.prepare(ASSESSMENT_SQL).all<SummaryAssessment>()).results;
  const staff = (await db.prepare(STAFF_SQL).all<{ email: string }>()).results;
  return { learners, assessments, staff };
}
