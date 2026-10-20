import { sqliteTable, text, integer, primaryKey, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const learners = sqliteTable('learners', { id:text('id').primaryKey(), code:text('code').notNull().unique(), created:text('created').notNull() });
export const progress = sqliteTable('progress', { learner:text('learner').notNull().references(()=>learners.id), lesson:integer('lesson').notNull(), read:integer('read').notNull().default(0), done:integer('done').notNull().default(0), score:integer('score').notNull().default(0), updated:text('updated').notNull() },t=>[primaryKey({columns:[t.learner,t.lesson]})]);
// client_id: khóa idempotency của phiếu quan sát (FR-OBS-04, DR-02). Cột nullable để giữ dòng cũ;
// SQLite cho phép nhiều NULL trong unique index nên dòng cũ không xung đột.
export const assessments=sqliteTable('assessments',{id:text('id').primaryKey(),learner:text('learner').notNull().references(()=>learners.id),phase:text('phase').notNull(),scores:text('scores').notNull(),assessor:text('assessor').notNull(),created:text('created').notNull(),client_id:text('client_id')},t=>[uniqueIndex('assessments_learner_client_unique').on(t.learner,t.client_id)]);
// kind: 'file' (R2) hoặc 'link' (DR-03). Với kind = 'link', key lưu chuỗi rỗng để không phải
// tạo lại bảng (SQLite không đổi được NOT NULL bằng ALTER). url chỉ dùng khi kind = 'link'.
// Không đặt CHECK ở đây: drizzle-kit sẽ sinh lệnh tạo lại bảng (DROP/RENAME) để thêm CHECK,
// trái chính sách migration. Giá trị kind được kiểm tra ở lớp service (shared/).
export const videos=sqliteTable('videos',{lesson:integer('lesson').primaryKey(),key:text('key').notNull(),mime:text('mime').notNull(),duration:integer('duration').notNull(),updated:text('updated').notNull(),kind:text('kind').notNull().default('file'),url:text('url')});
export const staff=sqliteTable('staff',{email:text('email').primaryKey(),created:text('created').notNull()});
// Bài học (FR-CNT-01, 02). lesson khớp id 0–9 hiện có. body và quiz là JSON TEXT;
// kiểm tra cấu trúc nằm ở shared/lesson-validation (commit 1.4), không ở DB.
export const lessons=sqliteTable('lessons',{lesson:integer('lesson').primaryKey(),title:text('title').notNull(),group_no:integer('group_no').notNull(),body:text('body').notNull(),quiz:text('quiz').notNull(),next_step:text('next_step'),created:text('created').notNull()},t=>[check('lessons_lesson_range', sql`${t.lesson} BETWEEN 0 AND 9`),check('lessons_group_range', sql`${t.group_no} BETWEEN 1 AND 5`)]);
