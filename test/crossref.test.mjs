import test from 'node:test';
import assert from 'node:assert/strict';
import { crossrefWorksUrl, dedupePapers, normalizeCrossrefWork } from '../src/crossref.mjs';

const journal = { id: 'jpe', name: 'Journal of Plant Ecology', issns: ['1752-9921'], publisher: 'OUP', pool: 'core' };
const raw = {
  DOI: 'https://doi.org/10.1234/ABC',
  title: ['<i>Drought</i> effects on soil carbon'],
  author: [{ given: 'Yu', family: 'Fu', ORCID: 'https://orcid.org/0000-0000' }],
  abstract: '<jats:p>We tested drought &amp; priming.</jats:p>',
  'published-online': { 'date-parts': [[2026, 9, 17]] },
  type: 'journal-article',
  URL: 'https://doi.org/10.1234/abc',
  link: [{ URL: 'https://example.org/paper.pdf', 'content-type': 'application/pdf' }],
  subject: ['Ecology'],
  ISSN: ['1752-9921']
};

test('Crossref 论文被规范化为稳定数据结构', () => {
  const paper = normalizeCrossrefWork(raw, journal);
  assert.equal(paper.doi, '10.1234/abc');
  assert.equal(paper.title, 'Drought effects on soil carbon');
  assert.equal(paper.abstract, 'We tested drought & priming.');
  assert.equal(paper.publishedAt, '2026-09-17');
  assert.equal(paper.articleType, 'research');
  assert.equal(paper.isOpenAccess, true);
  assert.equal(paper.authors[0].name, 'Yu Fu');
});

test('排除勘误和期次信息并按 DOI 去重', () => {
  assert.equal(normalizeCrossrefWork({ ...raw, title: ['Correction to drought effects'] }, journal), null);
  assert.equal(normalizeCrossrefWork({ ...raw, type: 'journal-issue' }, journal), null);
  const paper = normalizeCrossrefWork(raw, journal);
  const duplicate = normalizeCrossrefWork({ ...raw, title: ['Duplicate title'] }, journal);
  assert.equal(dedupePapers([paper, duplicate]).length, 1);
});

test('Crossref URL 包含时间和邮件参数', () => {
  const url = crossrefWorksUrl(journal, '2026-08-20', '2026-09-18', { mailto: 'name@example.com' });
  assert.match(url, /from-pub-date%3A2026-08-20/);
  assert.match(url, /mailto=name%40example.com/);
  assert.match(url, /journals\/1752-9921\/works/);
});
