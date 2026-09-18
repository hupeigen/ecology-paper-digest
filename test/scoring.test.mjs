import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePaper } from '../src/scoring.mjs';
import { loadTopics } from '../src/config.mjs';

test('导师相关论文获得更高的碳循环与全球变化评分', async () => {
  const topics = await loadTopics();
  const relevant = scorePaper({
    title: 'Drought and rhizosphere priming control soil organic carbon stability',
    abstract: 'A long-term drought experiment tested root exudates and plant-soil-microbe interactions.',
    hasAbstract: true, publishedAt: '2026-09-17', isOpenAccess: true
  }, topics);
  const unrelated = scorePaper({
    title: 'A new index for urban bird abundance',
    abstract: 'A survey of birds in cities.',
    hasAbstract: true, publishedAt: '2026-09-17', isOpenAccess: true
  }, topics);
  assert.ok(relevant.valueScores.advisor.score > unrelated.valueScores.advisor.score);
  assert.ok(relevant.totalScore > unrelated.totalScore);
  assert.ok(relevant.recommendationReason.includes('导师方向'));
});

test('无摘要论文降低评分置信度', async () => {
  const topics = await loadTopics();
  const without = scorePaper({ title: 'Drought and soil carbon', abstract: '', hasAbstract: false, publishedAt: '2026-09-17' }, topics);
  const withAbstract = scorePaper({ title: 'Drought and soil carbon', abstract: 'Drought affects soil carbon and microbial processes.', hasAbstract: true, publishedAt: '2026-09-17' }, topics);
  assert.equal(without.scoringConfidence, 0.55);
  assert.ok(withAbstract.totalScore > without.totalScore);
});
