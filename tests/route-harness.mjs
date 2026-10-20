import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Harness dùng chung cho kiểm thử API (CLAUDE.md mục 7): chạy route.ts thật trên SQLite thật,
// không mock tầng dữ liệu. Chỉ thay môi trường Workers bằng biến toàn cục.

const ROUTE_PATH = 'app/api/[...path]/route.ts';
const SHARED_PATH = 'shared/assessment-rules.ts';
const ROUTE_SHARED_IMPORT = "'../../../shared/assessment-rules'";

// Adapter theo interface prepare/bind/first/all/run/batch (CLAUDE.md mục 3), dùng cho node:sqlite.
export function createD1Adapter(sql) {
  return {
    prepare(query) {
      let values = [];
      const statement = {
        bind(...args) {
          values = args;
          return statement;
        },
        async first() {
          return sql.prepare(query).get(...values) || null;
        },
        async all() {
          return { results: sql.prepare(query).all(...values) };
        },
        async run() {
          return sql.prepare(query).run(...values);
        },
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
}

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
}

// Nạp route.ts thật. Import tương đối của shared/ được ghi thành tệp tạm rồi import qua file URL.
export async function loadApi(sql, { ownerEmail = 'owner@example.test' } = {}) {
  globalThis.__testEnv = { DB: createD1Adapter(sql), OWNER_EMAIL: ownerEmail, BUCKET: {} };
  const dir = mkdtempSync(join(tmpdir(), 'son-tra-so-test-'));
  try {
    writeFileSync(join(dir, 'assessment-rules.mjs'), transpile(readFileSync(SHARED_PATH, 'utf8')));
    const routeSource = readFileSync(ROUTE_PATH, 'utf8')
      .replace("import { env } from 'cloudflare:workers';", 'const env=globalThis.__testEnv;')
      .replace(ROUTE_SHARED_IMPORT, "'./assessment-rules.mjs'");
    const routeFile = join(dir, 'route.mjs');
    writeFileSync(routeFile, transpile(routeSource));
    return await import(pathToFileURL(routeFile).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
