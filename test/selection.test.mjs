import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPapers } from '../src/selection.mjs';

function paper(index, overrides = {}) {
  return {
    doi: `10.1000/test.${index}`,
    title: `Paper ${index}`,
    journalId: `journal-${index % 7}`,
    journal: `Journal ${index % 7}`,
    publishedAt: `2026-09-${String((index % 18) + 1).padStart(2, '0')}`,
    articleType: index % 5 === 0 ? 'review' : 'research',
    pool: index > 14 ? 'expansion' : 'core',
    rankingScore: 100 - index,
    valueScores: { advisor: { score: index % 2 === 0 ? 70 : 0 } },
    ...overrides
  };
}

test('日报限制为 4–5 篇、单刊最多 2 篇、综述最多 1 篇', () => {
  const result = selectPapers(Array.from({ length: 24 }, (_, index) => paper(index)), { kind: 'daily' });
  assert.ok(result.papers.length >= 4 && result.papers.length <= 5);
  assert.ok(result.papers.filter((item) => item.articleType === 'review').length <= 1);
  const counts = new Map();
  for (const item of result.papers) counts.set(item.journalId, (counts.get(item.journalId) || 0) + 1);
  assert.ok([...counts.values()].every((count) => count <= 2));
});

test('周报独立重评并最多 8 篇、单刊最多 3 篇', () => {
  const result = selectPapers(Array.from({ length: 24 }, (_, index) => paper(index)), { kind: 'weekly' });
  assert.equal(result.papers.length, 8);
  const counts = new Map();
  for (const item of result.papers) counts.set(item.journalId, (counts.get(item.journalId) || 0) + 1);
  assert.ok([...counts.values()].every((count) => count <= 3));
  assert.ok(result.papers.filter((item) => item.articleType === 'review').length <= 2);
});

test('日报从历史 DOI 中排除近 30 天已推荐文章', () => {
  const candidates = Array.from({ length: 8 }, (_, index) => paper(index));
  const result = selectPapers(candidates, { kind: 'daily', historyDois: [candidates[0].doi] });
  assert.ok(!result.papers.some((item) => item.doi === candidates[0].doi));
});
