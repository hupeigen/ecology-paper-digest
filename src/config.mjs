import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_DIR = path.join(ROOT, 'config');
export const DATA_DIR = path.join(ROOT, 'data');
export const REPORTS_DIR = path.join(DATA_DIR, 'reports');

export async function loadJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function loadJournals() {
  const config = await loadJson(path.join(CONFIG_DIR, 'journals.json'));
  validateJournals(config);
  return config;
}

export async function loadTopics() {
  const config = await loadJson(path.join(CONFIG_DIR, 'topics.json'));
  validateTopics(config);
  return config;
}

export function validateJournals(config) {
  if (!config || !Array.isArray(config.core) || !Array.isArray(config.expansion)) {
    throw new Error('journals.json 必须包含 core 与 expansion 数组');
  }
  const ids = new Set();
  for (const [pool, journals] of Object.entries({ core: config.core, expansion: config.expansion })) {
    for (const journal of journals) {
      if (!journal.id || !journal.name || !Array.isArray(journal.issns) || journal.issns.length === 0) {
        throw new Error(`${pool} 中存在缺少 id、name 或 issns 的期刊`);
      }
      if (ids.has(journal.id)) throw new Error(`期刊 id 重复：${journal.id}`);
      ids.add(journal.id);
      journal.pool = pool;
    }
  }
  return config;
}

export function validateTopics(config) {
  const expected = ['advisor', 'strategy', 'application', 'interdisciplinary', 'frontier'];
  const weights = config?.weights || {};
  const termGroups = config?.terms || {};
  for (const key of expected) {
    if (!Number.isFinite(weights[key]) || weights[key] < 0) throw new Error(`主题权重无效：${key}`);
    if (!Array.isArray(termGroups[key]) || termGroups[key].length === 0) throw new Error(`主题词缺失：${key}`);
  }
  const total = expected.reduce((sum, key) => sum + weights[key], 0);
  if (Math.abs(total - 1) > 1e-6) throw new Error(`主题权重总和必须为 1，当前为 ${total}`);
  return config;
}

export function journalMap(journals) {
  const map = new Map();
  for (const journal of [...journals.core, ...journals.expansion]) {
    for (const issn of [journal.issns[0], ...journal.issns.slice(1)]) map.set(issn, journal);
  }
  return map;
}
