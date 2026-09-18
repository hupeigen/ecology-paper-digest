import test from 'node:test';
import assert from 'node:assert/strict';
import { enhanceWithLlm, fallbackSummary, summarizeBatch } from '../src/summarize.mjs';
import { loadTopics } from '../src/config.mjs';
import { scorePaper } from '../src/scoring.mjs';

test('无摘要时规则总结明确拒绝推断实验设计', () => {
  const summary = fallbackSummary({ hasAbstract: false, title: 'Unknown methods', keywords: [] });
  assert.equal(summary.evidenceConfidence, 'metadata-only');
  assert.match(summary.design, /无法可靠判断/);
});

test('OpenAI 兼容接口结果被解析并合并评分', async () => {
  const topics = await loadTopics();
  const paper = scorePaper({
    doi: '10.1000/llm.1',
    title: 'Drought and soil carbon',
    abstract: 'A long-term drought experiment tested soil organic carbon and root exudates.',
    hasAbstract: true,
    publishedAt: '2026-09-18',
    keywords: [],
    methodSignals: ['long-term experiment']
  }, topics);
  const responseJson = {
    choices: [{ message: { content: JSON.stringify({ papers: [{
      doi: '10.1000/llm.1',
      valueScores: { advisor: 95, strategy: 80, application: 70, interdisciplinary: 60, frontier: 75 },
      keywords: ['drought', 'soil carbon'],
      recommendationReason: '直接关联导师方向与碳循环。',
      essence: {
        problem: '检验干旱如何影响土壤碳。',
        design: '长期干旱实验。',
        innovation: '揭示根际过程。',
        transferableIdeas: '可借鉴长期处理设计。',
        limitations: '摘要未给出样本量。'
      }
    }] }) } }]
  };
  const fetchImpl = async () => new Response(JSON.stringify(responseJson), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
  const result = await summarizeBatch([paper], {
    baseUrl: 'https://llm.example/v1', apiKey: 'secret', model: 'test-model', fetchImpl
  });
  assert.equal(result.used, true);
  assert.ok(result.assessments.has('10.1000/llm.1'));
  const enhanced = await enhanceWithLlm([paper], topics, {
    baseUrl: 'https://llm.example/v1', apiKey: 'secret', model: 'test-model', fetchImpl
  });
  assert.equal(enhanced.papers[0].totalScore, 79);
  assert.equal(enhanced.papers[0].essence.summaryMode, 'llm');
});

test('LLM 返回非法结构时保留规则结果', async () => {
  const paper = { doi: '10.1000/llm.2', title: 'Paper', abstract: 'A field study.', hasAbstract: true };
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not json' } }] }), { status: 200 });
  const result = await summarizeBatch([paper], {
    baseUrl: 'https://llm.example/v1', apiKey: 'secret', model: 'test-model', fetchImpl
  });
  assert.equal(result.used, false);
  assert.ok(result.warnings.length > 0);
});


