// scripts/check-api-boundary.mjs
// Keeps the frontend/backend boundary: only src/app/api talks to Supabase. Everything
// else calls the API services (public-api, admin-api, auth-api) and uses api/models.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'src/app';
const forbidden = [
  /from ['"]@supabase\//, // the Supabase SDK
  /from ['"][./]*(?:api\/)?supabase['"]/, // the client (api/supabase.ts)
  /from ['"][./]*(?:api\/)?database\.types['"]/, // generated database types
];

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'api' && dir === root ? [] : files(path);
    return path.endsWith('.ts') ? [path] : [];
  });

const violations = files(root).flatMap((file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => forbidden.some((pattern) => pattern.test(line)))
    .map(({ line, i }) => `${relative('.', file)}:${i + 1}  ${line.trim()}`),
);

if (violations.length) {
  console.error('API boundary: only src/app/api may use Supabase. Call an API service instead:');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log('api-boundary: ok');
