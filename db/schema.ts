import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('workspaces', { owner: text('owner').primaryKey(), dataset: text('dataset').notNull(), versions: text('versions').notNull(), updatedAt: text('updated_at').notNull() });
export const runs = sqliteTable('runs', { id: text('id').primaryKey(), owner: text('owner').notNull(), createdAt: text('created_at').notNull(), report: text('report').notNull() });
export const publicRecords = sqliteTable('public_records', { key:text('key').primaryKey(), value:text('value').notNull(), revision:integer('revision').notNull().default(0) });
