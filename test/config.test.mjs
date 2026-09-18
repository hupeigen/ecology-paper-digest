import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJournals, loadTopics, validateJournals, validateTopics } from '../src/config.mjs';
import { previousNaturalWeek, shiftDate, todayInShanghai } from '../src/dates.mjs';

test('核心期刊与扩展期刊配置完整且无重复', async () => {
  const journals = await loadJournals();
  assert.equal(journals.core.length, 8);
  assert.equal(journals.expansion.length, 8);
  assert.deepEqual(journals.core.map((item) => item.id), [
    'jpe', 'imeta', 'green-carbon', 'pedosphere', 'eeh', 'ecology-letters', 'journal-of-ecology', 'ecological-indicators'
  ]);
  assert.doesNotThrow(() => validateJournals(structuredClone(journals)));
  assert.throws(() => validateJournals({ core: [{ ...journals.core[0], id: 'x' }], expansion: [{ ...journals.expansion[0], id: 'x' }] }), /重复/);
});

test('主题权重总和为 1 且导师方向词完整', async () => {
  const topics = await loadTopics();
  assert.equal(Object.values(topics.weights).reduce((sum, value) => sum + value, 0), 1);
  assert.ok(topics.terms.advisor.includes('rhizosphere priming'));
  assert.ok(topics.terms.advisor.includes('soil organic carbon'));
  assert.doesNotThrow(() => validateTopics(structuredClone(topics)));
});

test('上海日期与上一自然周计算正确', () => {
  assert.equal(todayInShanghai(new Date('2026-09-17T23:30:00Z')), '2026-09-18');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.deepEqual(previousNaturalWeek('2026-09-18'), { from: '2026-09-07', to: '2026-09-13' });
});
