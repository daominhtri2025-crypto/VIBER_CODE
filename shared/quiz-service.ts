// Dịch vụ ghi lượt làm bài kiểm tra (FR-LRN-08 đến 10; CLAUDE.md mục 3, 4.1, 4.7). Chuyển từ route.ts sang đây.
// Route kiểm tra đầu vào và quyền học viên, rồi gọi dịch vụ; chấm điểm, idempotency và cập nhật điểm nằm ở đây.
// Không nhận yêu cầu HTTP: dùng chung cho route (Sites) và máy chủ cục bộ.
import { gradeChoice, isChoiceInRange, isSameQuizAttempt, parseStoredQuiz, type QuizAnswerInput } from './quiz-rules';
import { recordQuizPass, type ProgressDb } from './progress-service';

// Kết quả để route đổi sang HTTP. Thứ tự các nhánh khớp thứ tự kiểm tra cũ của route.
export type QuizOutcome =
  | { kind: 'unknown_lesson' }
  | { kind: 'unreadable_quiz' }
  | { kind: 'invalid_choice' }
  | { kind: 'unavailable' }
  | { kind: 'conflict' }
  | { kind: 'stored'; correct: boolean; attemptCount: number };

// Ghi lượt làm theo (learner, client_id). Đáp án chỉ đọc từ bảng lessons và chấm trên máy chủ (quyết định 2).
// Cùng client_id khác lựa chọn là xung đột (quyết định 5). Điểm kiểm tra chỉ được ghi khi đúng và không giảm.
export async function submitQuizAnswer(
  db: ProgressDb,
  learnerId: string,
  input: QuizAnswerInput,
  ids: { newId: string; now: string },
): Promise<QuizOutcome> {
  const row = await db
    .prepare('SELECT quiz FROM lessons WHERE lesson=?')
    .bind(input.lesson)
    .first<{ quiz: string }>();
  if (!row) return { kind: 'unknown_lesson' };

  const quiz = parseStoredQuiz(row.quiz);
  if (!quiz) return { kind: 'unreadable_quiz' };
  if (!isChoiceInRange(input.choice, quiz.options.length)) return { kind: 'invalid_choice' };

  await db
    .prepare(
      'INSERT INTO quiz_attempts(id,learner,lesson,choice,correct,client_id,created) VALUES(?,?,?,?,?,?,?) ON CONFLICT(learner,client_id) DO NOTHING',
    )
    .bind(ids.newId, learnerId, input.lesson, input.choice, gradeChoice(input.choice, quiz.answer), input.clientId, ids.now)
    .run();

  const stored = await db
    .prepare('SELECT lesson,choice,correct FROM quiz_attempts WHERE learner=? AND client_id=?')
    .bind(learnerId, input.clientId)
    .first<{ lesson: number; choice: number; correct: number }>();
  if (!stored) return { kind: 'unavailable' };
  if (!isSameQuizAttempt(stored, input)) return { kind: 'conflict' };

  // Ghi lại cả với lượt lặp để lần thử lại sau sự cố vẫn hoàn tất (quy tắc 4.1: điểm chỉ tăng).
  if (stored.correct === 1) await recordQuizPass(db, learnerId, stored.lesson, ids.now);

  const count = await db
    .prepare('SELECT COUNT(*) AS n FROM quiz_attempts WHERE learner=? AND lesson=?')
    .bind(learnerId, stored.lesson)
    .first<{ n: number }>();
  return { kind: 'stored', correct: stored.correct === 1, attemptCount: Number(count?.n ?? 0) };
}
