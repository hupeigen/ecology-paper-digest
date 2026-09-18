import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REPORTS_DIR, ROOT } from '../src/config.mjs';

const WEB_DIR = path.join(ROOT, 'web');
const DIST_DIR = path.join(ROOT, 'dist');

async function exists(filePath) {
  try { await stat(filePath); return true; } catch { return false; }
}

async function main() {
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });
  await cp(WEB_DIR, DIST_DIR, { recursive: true });
  if (await exists(REPORTS_DIR)) await cp(REPORTS_DIR, path.join(DIST_DIR, 'reports'), { recursive: true });
  await writeFile(path.join(DIST_DIR, '.nojekyll'), '', 'utf8');
  console.log(`站点已构建：${DIST_DIR}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
