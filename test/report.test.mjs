import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, publicPaper, recentHistoryDois } from '../src/report.mjs';
import { reportToMarkdown } from '../src/markdown.mjs';

function samplePaper() {
  return {
    doi: '10.1000/report.1', title: 'Drought and soil carbon', authors: [{ name: 'A. Li' }],
    journal: 'Journal of Plant Ecology', journalId: 'jpe', publishedAt: '2026-09-18',
    articleType: 'research', doiUrl: 'https://doi.org/10.1000/report.1',
    keywords: ['soil carbon'], valueScores: {
      advisor: { score: 90 }, strategy: { score: 80 }, application: { score: 70 },
      interdisciplinary: { score: 60 }, frontier: { score: 50 }
    }, totalScore: 74, recommendationReason: '导师方向相关。',
    essence: { problem: '问题', design: '设计', innovation: '创新', transferableIdeas: '借鉴', limitations: '局限', evidenceConfidence: 'abstract', summaryMode: 'rules' },
    abstract: 'PRIVATE FULL ABSTRACT', methodSignals: [], sources: []
  };
}

test('公开报告不包含原始摘要字段', () => {
  const publicValue = publicPaper(samplePaper(), 1);
  assert.equal(publicValue.abstract, undefined);
  assert.equal(publicValue.rank, 1);
});

test('报告可转换为 Markdown', () => {
  const report = buildReport({
    kind: 'daily', reportId: '2026-09-18', date: '2026-09-18', period: { from: '2026-08-20', to: '2026-09-18' },
    papers: [samplePaper()], diagnostics: {}, warnings: [], notes: []
  });
  const markdown = reportToMarkdown(report);
  assert.match(markdown, /Drought and soil carbon/);
  assert.match(markdown, /导师方向/);
  assert.doesNotMatch(markdown, /PRIVATE FULL ABSTRACT/);
});

test('近 30 天历史 DOI 排除当天且过滤窗口', () => {
  const index = {
    daily: [
      { date: '2026-09-17', paperDois: ['a', 'b'] },
      { date: '2026-09-18', paperDois: ['current'] },
      { date: '2026-05-01', paperDois: ['old'] }
    ]
  };
  assert.deepEqual(recentHistoryDois(index, '2026-09-18', 30), ['a', 'b']);
});
