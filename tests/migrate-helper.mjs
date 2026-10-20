import { readFileSync } from 'node:fs';

// Nạp migration theo đúng thứ tự trong drizzle/meta/_journal.json (CLAUDE.md mục 5, 7).
// Chỉ định khoảng [from, to) theo chỉ số trong journal; mặc định: toàn bộ.
export function applyMigrations(sql, { from = 0, to = Infinity } = {}) {
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'));
  const entries = journal.entries.slice(from, to);
  for (const entry of entries) {
    const file = readFileSync(`drizzle/${entry.tag}.sql`, 'utf8');
    sql.exec(file.replaceAll('--> statement-breakpoint', ''));
  }
  return entries.map((entry) => entry.tag);
}
