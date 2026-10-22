import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Harness dùng chung cho kiểm thử API (CLAUDE.md mục 7): chạy route.ts thật trên SQLite thật,
// không mock tầng dữ liệu. Chỉ thay môi trường Workers bằng biến toàn cục.

const ROUTE_PATH = 'app/api/[...path]/route.ts';
const SHARED_DIR = 'shared';

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

// Đổi import tương đối sang tệp .mjs cùng thư mục tạm (route và shared/ đều dùng '../../../shared/X' hoặc './X').
function rewriteImports(code) {
  return code
    .replace(/from '\.\.\/\.\.\/\.\.\/shared\/([\w-]+)'/g, "from './$1.mjs'")
    .replace(/from '\.\/([\w-]+)'/g, "from './$1.mjs'");
}

// Nạp route.ts thật. Mọi tệp trong shared/ được ghi thành .mjs tạm rồi import qua file URL.
// bucket: đối tượng R2 giả lập (put/get/delete) để kiểm tra việc ghi và xóa tệp. Mặc định là bucket rỗng.
export async function loadApi(sql, { ownerEmail = 'owner@example.test', bucket = {} } = {}) {
  globalThis.__testEnv = { DB: createD1Adapter(sql), OWNER_EMAIL: ownerEmail, BUCKET: bucket };
  const dir = mkdtempSync(join(tmpdir(), 'son-tra-so-test-'));
  try {
    for (const file of readdirSync(SHARED_DIR).filter((name) => name.endsWith('.ts'))) {
      const source = readFileSync(join(SHARED_DIR, file), 'utf8');
      writeFileSync(join(dir, `${basename(file, '.ts')}.mjs`), rewriteImports(transpile(source)));
    }
    const routeSource = readFileSync(ROUTE_PATH, 'utf8')
      .replace("import { env } from 'cloudflare:workers';", 'const env=globalThis.__testEnv;');
    const routeFile = join(dir, 'route.mjs');
    writeFileSync(routeFile, rewriteImports(transpile(routeSource)));
    return await import(pathToFileURL(routeFile).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Nạp một module trong shared/ (ví dụ 'video-rules') để kiểm thử đơn vị dùng đúng mã nguồn TypeScript.
export async function loadShared(name) {
  const dir = mkdtempSync(join(tmpdir(), 'son-tra-so-shared-'));
  try {
    for (const file of readdirSync(SHARED_DIR).filter((entry) => entry.endsWith('.ts'))) {
      const source = readFileSync(join(SHARED_DIR, file), 'utf8');
      writeFileSync(join(dir, `${basename(file, '.ts')}.mjs`), rewriteImports(transpile(source)));
    }
    return await import(pathToFileURL(join(dir, `${name}.mjs`)).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
