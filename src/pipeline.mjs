import { readFile } from 'node:fs/promises';
import { fetchJournalPool } from './crossref.mjs';
import { enrichPapers } from './enrich.mjs';
import { buildReport, recentHistoryDois, readIndex, writeReport } from './report.mjs';
import { scorePaper, sortByRanking } from './scoring.mjs';
import { selectPapers } from './selection.mjs';
import { enhanceWithLlm, finalizeSummaries } from './summarize.mjs';
import { normalizeDoi, uniqueStrings } from './text.mjs';

function scoreAll(papers, topics) {
  return papers.map((paper) => scorePaper(paper, topics));
}

function replaceEnriched(allPapers, enrichedPapers) {
  const map = new Map(enrichedPapers.map((paper) => [normalizeDoi(paper.doi), paper]));
  return allPapers.map((paper) => map.get(normalizeDoi(paper.doi)) || paper);
}

export function chooseForEnrichment(papers, options = {}) {
  const perJournal = Math.max(1, Number(options.perJournal ?? 4));
  const max = Math.max(perJournal, Number(options.max ?? 36));
  const ranked = sortByRanking(papers);
  const journalCounts = new Map();
  const chosen = [];
  const ids = new Set();
  for (const paper of ranked) {
    const count = journalCounts.get(paper.journalId) || 0;
    if (count >= perJournal) continue;
    chosen.push(paper);
    ids.add(normalizeDoi(paper.doi));
    journalCounts.set(paper.journalId, count + 1);
    if (chosen.length >= max) break;
  }
  for (const paper of ranked) {
    if (chosen.length >= max) break;
    if (!ids.has(normalizeDoi(paper.doi))) chosen.push(paper);
  }
  return chosen;
}

export async function loadFixture(filePath) {
  const payload = JSON.parse(await readFile(filePath, 'utf8'));
  const papers = Array.isArray(payload) ? payload : payload.papers;
  if (!Array.isArray(papers)) throw new Error('离线样本必须是论文数组或包含 papers 数组');
  return papers.map((paper) => ({
    id: normalizeDoi(paper.doi || paper.id),
    doi: normalizeDoi(paper.doi || paper.id),
    title: String(paper.title || ''),
    authors: Array.isArray(paper.authors) ? paper.authors : [],
    journal: String(paper.journal || 'Fixture Journal'),
    journalId: String(paper.journalId || 'fixture'),
    issns: Array.isArray(paper.issns) ? paper.issns : [],
    publisher: String(paper.publisher || ''),
    publishedAt: String(paper.publishedAt || ''),
    articleType: paper.articleType === 'review' ? 'review' : 'research',
    doiUrl: String(paper.doiUrl || `https://doi.org/${normalizeDoi(paper.doi || paper.id)}`),
    landingUrl: String(paper.landingUrl || paper.doiUrl || ''),
    pdfUrl: paper.pdfUrl || null,
    oaUrl: paper.oaUrl || paper.pdfUrl || null,
    isOpenAccess: Boolean(paper.isOpenAccess || paper.oaUrl || paper.pdfUrl),
    abstract: String(paper.abstract || ''),
    hasAbstract: Boolean(paper.abstract || paper.hasAbstract),
    subjects: Array.isArray(paper.subjects) ? paper.subjects : [],
    referenceCount: Number(paper.referenceCount || 0),
    citedByCount: Number(paper.citedByCount || 0),
    pool: paper.pool === 'expansion' ? 'expansion' : 'core',
    sources: Array.isArray(paper.sources) ? paper.sources : [{ name: 'Fixture', url: paper.doiUrl || '' }]
  })).filter((paper) => paper.doi && paper.title);
}

export async function buildCandidateSet({ from, to, journals, topics, options = {} }) {
  const warnings = [];
  let papers = [];
  if (options.fixturePath) {
    papers = await loadFixture(options.fixturePath);
  } else {
    const core = await fetchJournalPool(journals.core, from, to, {
      mailto: options.contactEmail,
      maxPages: options.maxPages ?? 3,
      delayMs: options.delayMs ?? 120,
      requestOptions: options.requestOptions
    });
    papers.push(...core.papers);
    warnings.push(...core.warnings);
    const expectedMinimum = options.expectedMinimum ?? 4;
    if (core.papers.length < expectedMinimum) {
      const expansion = await fetchJournalPool(journals.expansion, from, to, {
        mailto: options.contactEmail,
        maxPages: options.maxPages ?? 3,
        delayMs: options.delayMs ?? 120,
        requestOptions: options.requestOptions
      });
      papers.push(...expansion.papers);
      warnings.push(...expansion.warnings);
    }
    if (papers.length === 0 && core.warnings.length > 0) {
      throw new Error(`Crossref 候选获取失败：${uniqueStrings(core.warnings).join('；')}`);
    }
  }

  let scored = scoreAll(papers, topics);
  scored = scored.filter((paper) => !paper.isRetracted);
  const enrichmentTargets = chooseForEnrichment(scored, {
    perJournal: options.perJournalEnrichment ?? 4,
    max: options.maxEnrichment ?? 36
  });
  if (!options.skipEnrichment) {
    const enriched = await enrichPapers(enrichmentTargets, {
      contactEmail: options.contactEmail,
      maxUnpaywall: options.maxUnpaywall ?? 30,
      maxDoaj: options.maxDoaj ?? 4,
      maxLanding: options.maxLanding ?? 10,
      requestOptions: options.requestOptions
    });
    scored = scoreAll(replaceEnriched(scored, enriched.papers), topics);
    warnings.push(...enriched.warnings);
  }
  return { papers: scored, warnings: uniqueStrings(warnings) };
}

export async function prepareReportCandidates({ from, to, journals, topics, options = {} }) {
  const expectedMinimum = options.kind === 'weekly' ? 8 : 4;
  return buildCandidateSet({ from, to, journals, topics, options: { ...options, expectedMinimum } });
}

export async function selectAndSummarize({ candidates, historyDois = [], topics, kind, options = {} }) {
  const ranked = sortByRanking(candidates);
  const llmInput = ranked.slice(0, Number(options.maxLlmCandidates ?? 12));
  const enhanced = await enhanceWithLlm(llmInput, topics, {
    baseUrl: options.llmBaseUrl,
    apiKey: options.llmApiKey,
    model: options.llmModel,
    disabled: options.disableLlm,
    maxPapers: options.maxLlmCandidates ?? 12
  });
  const enhancedMap = new Map(enhanced.papers.map((paper) => [normalizeDoi(paper.doi), paper]));
  const merged = ranked.map((paper) => enhancedMap.get(normalizeDoi(paper.doi)) || paper);
  const selection = selectPapers(merged, { kind, historyDois });
  return {
    ...selection,
    papers: finalizeSummaries(selection.papers),
    warnings: enhanced.warnings,
    llmUsed: enhanced.used
  };
}

export async function generateReport({ kind, date, reportId, period, journals, topics, options = {} }) {
  const candidateSet = await prepareReportCandidates({
    from: period.from,
    to: period.to,
    journals,
    topics,
    options: { ...options, kind }
  });
  const index = await readIndex();
  const historyDois = kind === 'daily'
    ? recentHistoryDois(index, date, options.historyDays ?? 30, 'daily')
    : [];
  const selected = await selectAndSummarize({
    candidates: candidateSet.papers,
    historyDois,
    topics,
    kind,
    options
  });
  const report = buildReport({
    kind,
    reportId,
    date,
    period,
    papers: selected.papers,
    warnings: [...candidateSet.warnings, ...selected.warnings],
    notes: selected.notes,
    diagnostics: {
      ...selected.diagnostics,
      llmUsed: selected.llmUsed,
      sourceCandidateCount: candidateSet.papers.length
    }
  });
  if (options.write !== false) await writeReport(report);
  return report;
}
