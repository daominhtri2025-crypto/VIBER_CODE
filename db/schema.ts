import { sqliteTable, text, integer, primaryKey, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const learners = sqliteTable('learners', { id:text('id').primaryKey(), code:text('code').notNull().unique(), created:text('created').notNull() });
export const progress = sqliteTable('progress', { learner:text('learner').notNull().references(()=>learners.id), lesson:integer('lesson').notNull(), read:integer('read').notNull().default(0), done:integer('done').notNull().default(0), score:integer('score').notNull().default(0), updated:text('updated').notNull(),
// completed_at: thời điểm lần đầu đánh dấu hoàn thành (ISO 8601 UTC). NULL với dòng cũ trước 0003,
// không suy đoán từ updated vì giá trị đó không phải thời điểm hoàn thành. Hoàn thành chỉ là tự xác nhận (quy tắc 4.7).
completed_at:text('completed_at') },t=>[primaryKey({columns:[t.learner,t.lesson]}),
// Migration 0005 (báo cáo quản trị): chỉ mục phục vụ tổng hợp theo bài và lọc theo kỳ hoàn thành (mốc completed_at, không dùng updated).
index('progress_lesson_idx').on(t.lesson),index('progress_completed_at_idx').on(t.completed_at)]);
// client_id: khóa idempotency của phiếu quan sát (FR-OBS-04, DR-02). Cột nullable để giữ dòng cũ;
// SQLite cho phép nhiều NULL trong unique index nên dòng cũ không xung đột.
export const assessments=sqliteTable('assessments',{id:text('id').primaryKey(),learner:text('learner').notNull().references(()=>learners.id),phase:text('phase').notNull(),scores:text('scores').notNull(),assessor:text('assessor').notNull(),created:text('created').notNull(),client_id:text('client_id')},t=>[uniqueIndex('assessments_learner_client_unique').on(t.learner,t.client_id)]);
// kind: 'file' (R2) hoặc 'link' (DR-03). Với kind = 'link', key lưu chuỗi rỗng để không phải
// tạo lại bảng (SQLite không đổi được NOT NULL bằng ALTER). url chỉ dùng khi kind = 'link'.
// Không đặt CHECK ở đây: drizzle-kit sẽ sinh lệnh tạo lại bảng (DROP/RENAME) để thêm CHECK,
// trái chính sách migration. Giá trị kind được kiểm tra ở lớp service (shared/).
export const videos=sqliteTable('videos',{lesson:integer('lesson').primaryKey(),key:text('key').notNull(),mime:text('mime').notNull(),duration:integer('duration').notNull(),updated:text('updated').notNull(),kind:text('kind').notNull().default('file'),url:text('url')});
export const staff=sqliteTable('staff',{email:text('email').primaryKey(),created:text('created').notNull()});
// Mã bài không còn giới hạn 0–9 (quyết định 30/10/2026; migration 0010, 0011): chỉ kiểm tra không âm.
// quiz_attempts: lịch sử làm bài kiểm tra trắc nghiệm, do máy chủ chấm (quyết định 3, 5 của Mục 2).
// choice là chỉ số đáp án học viên chọn; correct do máy chủ tính từ đáp án trong bảng lessons, không nhận từ client.
// client_id bắt buộc, idempotent theo (learner, client_id) như phiếu quan sát (quyết định 5). Không unique theo (learner, lesson)
// vì một bài có thể làm nhiều lần (quyết định 4: đếm số lần làm bài).
export const quizAttempts=sqliteTable('quiz_attempts',{id:text('id').primaryKey(),learner:text('learner').notNull().references(()=>learners.id),lesson:integer('lesson').notNull(),choice:integer('choice').notNull(),correct:integer('correct').notNull(),client_id:text('client_id').notNull(),created:text('created').notNull()},t=>[uniqueIndex('quiz_attempts_learner_client_unique').on(t.learner,t.client_id),
// Migration 0005: tổng hợp theo bài và theo kỳ (mốc created), và tính đạt theo học viên.
index('quiz_attempts_lesson_created_idx').on(t.lesson,t.created),index('quiz_attempts_learner_lesson_idx').on(t.learner,t.lesson),check('quiz_attempts_lesson_min', sql`${t.lesson} >= 0`),check('quiz_attempts_choice_min', sql`${t.choice} >= 0`),check('quiz_attempts_correct_bool', sql`${t.correct} IN (0, 1)`)]);
// Bài học (FR-CNT-01, 02; CLAUDE.md mục 4.4, 4.15, 4.16). Mã bài không còn giới hạn 0–9 (migration 0010).
// hidden: bài ẩn không hiện với học viên, số liệu lịch sử giữ nguyên. updated: thời điểm sửa gần nhất.
// body và quiz là JSON TEXT; kiểm tra cấu trúc nằm ở shared/lesson-validation, không ở DB.
export const lessons=sqliteTable('lessons',{lesson:integer('lesson').primaryKey(),title:text('title').notNull(),group_no:integer('group_no').notNull(),body:text('body').notNull(),quiz:text('quiz').notNull(),next_step:text('next_step'),created:text('created').notNull(),updated:text('updated').notNull(),hidden:integer('hidden').notNull().default(0)},t=>[check('lessons_lesson_min', sql`${t.lesson} >= 0`),check('lessons_group_range', sql`${t.group_no} BETWEEN 1 AND 5`),check('lessons_hidden_bool', sql`${t.hidden} IN (0, 1)`)]);
// Lịch sử phiên bản bài học (migration 0010, FR-LES-04): bản trước mỗi lần sửa; không ghi đè mất dữ liệu cũ.
export const lessonVersions=sqliteTable('lesson_versions',{id:integer('id').primaryKey({autoIncrement:true}),lesson:integer('lesson').notNull().references(()=>lessons.lesson),title:text('title').notNull(),group_no:integer('group_no').notNull(),body:text('body').notNull(),quiz:text('quiz').notNull(),next_step:text('next_step'),hidden:integer('hidden').notNull(),saved_by:text('saved_by').notNull(),saved_at:text('saved_at').notNull()},t=>[index('lesson_versions_lesson_idx').on(t.lesson,t.saved_at)]);

// Tài khoản quản trị và tình nguyện viên (migration 0006, FR-AUTH). Mật khẩu chỉ lưu băm PBKDF2-SHA256.
export const accounts=sqliteTable('accounts',{id:text('id').primaryKey(),email:text('email').notNull().unique(),full_name:text('full_name'),password_hash:text('password_hash').notNull(),active:integer('active').notNull().default(1),must_change:integer('must_change').notNull().default(0),failed_attempts:integer('failed_attempts').notNull().default(0),locked_until:text('locked_until'),created:text('created').notNull(),updated:text('updated').notNull()},t=>[check('accounts_active_bool', sql`${t.active} IN (0, 1)`),check('accounts_must_change_bool', sql`${t.must_change} IN (0, 1)`)]);
// Phiên đăng nhập (migration 0006): chỉ lưu băm SHA-256 của mã phiên. Xóa theo tài khoản.
export const sessions=sqliteTable('sessions',{token_hash:text('token_hash').primaryKey(),account_id:text('account_id').notNull().references(()=>accounts.id,{onDelete:'cascade'}),role:text('role').notNull(),expires_at:text('expires_at').notNull(),created:text('created').notNull()},t=>[index('sessions_account_idx').on(t.account_id),check('sessions_role_check', sql`${t.role} IN ('admin', 'volunteer')`)]);
// Tin tức trang chủ (migration 0007, FR-NEWS).
export const news=sqliteTable('news',{id:integer('id').primaryKey({autoIncrement:true}),title:text('title').notNull(),summary:text('summary').notNull().default(''),content:text('content').notNull().default(''),source_url:text('source_url'),hidden:integer('hidden').notNull().default(0),published_at:text('published_at').notNull(),created_by:text('created_by'),created:text('created').notNull(),updated:text('updated').notNull()},t=>[index('news_visible_published_idx').on(t.hidden,t.published_at),check('news_title_length', sql`length(${t.title}) BETWEEN 1 AND 200`),check('news_summary_length', sql`length(${t.summary}) <= 500`),check('news_content_length', sql`length(${t.content}) <= 5000`),check('news_source_url_https', sql`${t.source_url} IS NULL OR (${t.source_url} LIKE 'https://%' AND length(${t.source_url}) <= 500)`),check('news_hidden_bool', sql`${t.hidden} IN (0, 1)`)]);
// Token đặt lại mật khẩu (migration 0008, FR-AUTH-11): chỉ lưu băm SHA-256 của token.
export const passwordResetTokens=sqliteTable('password_reset_tokens',{id:text('id').primaryKey(),account_id:text('account_id').notNull().references(()=>accounts.id,{onDelete:'cascade'}),token_hash:text('token_hash').notNull().unique(),created:text('created').notNull(),expires_at:text('expires_at').notNull(),used_at:text('used_at')},t=>[index('password_reset_tokens_account_idx').on(t.account_id,t.created),check('password_reset_tokens_hash_length', sql`length(${t.token_hash}) = 64`)]);
// Bộ đếm giới hạn yêu cầu theo cửa sổ giờ (migration 0009). Khóa là băm IP, không lưu IP thô.
export const requestLimits=sqliteTable('request_limits',{key:text('key').primaryKey(),window_start:text('window_start').notNull(),count:integer('count').notNull()},t=>[check('request_limits_count_min', sql`${t.count} >= 0`)]);
