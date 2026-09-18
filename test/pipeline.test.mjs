import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJournals, loadTopics } from '../src/config.mjs';
import { chooseForEnrichment, generateReport } from '../src/pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(ROOT, 'test', 'fixtures', 'papers.json');

test('候选富集优先覆盖不同期刊', () => {
  const papers = Array.from({ length: 20 }, (_, index) => ({
    doi: `10.1000/a.${index}`, journalId: `j-${index % 4}`, rankingScore: 100 - index, publishedAt: '2026-09-18'
  }));
  const chosen = chooseForEnrichment(papers, { perJournal: 2, max: 8 });
  const counts = new Map();
  for (const paper of chosen) counts.set(paper.journalId, (counts.get(paper.journalId) || 0) + 1);
  assert.equal(chosen.length, 8);
  assert.ok([...counts.values()].every((count) => count === 2));
});

test('离线样本可生成日报且不公开完整摘要', async () => {
  const journals = await loadJournals();
  const topics = await loadTopics();
  const report = await generateReport({
    kind: 'daily', date: '2026-09-18', reportId: 'test-daily',
    period: { from: '2026-08-20', to: '2026-09-18' }, journals, topics,
    options: { fixturePath, skipEnrichment: true, disableLlm: true, write: false }
  });
  assert.ok(report.paperCount >= 4 && report.paperCount <= 5);
  assert.equal(JSON.stringify(report).includes('"abstract":'), false);
  assert.ok(report.papers.every((paper) => paper.essence));
});

test('离线样本可生成周报并达到 8 篇', async () => {
  const journals = await loadJournals();
  const topics = await loadTopics();
  const report = await generateReport({
    kind: 'weekly', date: '2026-09-14', reportId: '2026-W37',
    period: { from: '2026-09-07', to: '2026-09-13' }, journals, topics,
    options: { fixturePath, skipEnrichment: true, disableLlm: true, write: false }
  });
  assert.equal(report.paperCount, 8);
});
