import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const learners = sqliteTable('learners', { id:text('id').primaryKey(), code:text('code').notNull().unique(), created:text('created').notNull() });
export const progress = sqliteTable('progress', { learner:text('learner').notNull().references(()=>learners.id), lesson:integer('lesson').notNull(), read:integer('read').notNull().default(0), done:integer('done').notNull().default(0), score:integer('score').notNull().default(0), updated:text('updated').notNull() },t=>[primaryKey({columns:[t.learner,t.lesson]})]);
export const assessments=sqliteTable('assessments',{id:text('id').primaryKey(),learner:text('learner').notNull().references(()=>learners.id),phase:text('phase').notNull(),scores:text('scores').notNull(),assessor:text('assessor').notNull(),created:text('created').notNull()});
export const videos=sqliteTable('videos',{lesson:integer('lesson').primaryKey(),key:text('key').notNull(),mime:text('mime').notNull(),duration:integer('duration').notNull(),updated:text('updated').notNull()});
export const staff=sqliteTable('staff',{email:text('email').primaryKey(),created:text('created').notNull()});
