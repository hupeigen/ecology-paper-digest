import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLandingMetadata, reconstructAbstract } from '../src/enrich.mjs';

test('OpenAlex 倒排摘要可重建', () => {
  const text = reconstructAbstract({ We: [0], tested: [1], carbon: [2], cycling: [3] });
  assert.equal(text, 'We tested carbon cycling');
});

test('公开落地页元数据可提取摘要与 PDF', () => {
  const html = `<!doctype html><html><head>
    <meta name="citation_title" content="A useful paper">
    <meta name="citation_abstract" content="This field experiment tested drought effects on soil carbon and root exudates over five years.">
    <meta name="citation_pdf_url" content="https://example.org/paper.pdf">
  </head></html>`;
  const result = parseLandingMetadata(html);
  assert.match(result.abstract, /field experiment/);
  assert.equal(result.pdfUrl, 'https://example.org/paper.pdf');
  assert.equal(result.title, 'A useful paper');
});
