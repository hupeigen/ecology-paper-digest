import {readFile} from 'node:fs/promises';
import {createBudget,evaluateTopicCandidates,analyzeMonthly} from './research.mjs';
import {scoreForTopic,CRITERIA} from './criteria.mjs';
import {selectMonthly} from './monthly.mjs';

import { fetchJournalPool } from './crossref.mjs';
import { enrichPapers } from './enrich.mjs';
import { buildReport, recentHistoryDois, readIndex, readReport, writeReport } from './report.mjs';
import { scorePaper, sortByRanking } from './scoring.mjs';
import { selectPapers } from './selection.mjs';
import { enhanceWithLlm, finalizeSummaries } from './summarize.mjs';
import { normalizeDoi, uniqueStrings } from './text.mjs';

function scoreAll(papers, topics) {
  return papers.map((paper) => scoreForTopic(scorePaper(paper, topics)));
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
  let coverage = [];
  if (options.fixturePath) {
    papers = await loadFixture(options.fixturePath);
    const fixturePayload=JSON.parse(await readFile(options.fixturePath,'utf8'));
    coverage=fixturePayload.coverage||[]; warnings.push(...(fixturePayload.warnings||[]));
  } else {
    const result = await fetchJournalPool([...journals.core,...journals.expansion], from, to, {
      mailto:options.contactEmail,maxPages:options.maxPages??3,delayMs:options.delayMs??300,requestOptions:options.requestOptions
    });
    papers=result.papers; warnings.push(...result.warnings); coverage=result.coverage;
    if((coverage.length && coverage.every(c=>c.error && c.pages===0)) || (!papers.length && warnings.length)) throw new Error('所有期刊获取失败，保留上一版');
  }
  if(options.kind==='monthly') papers=papers.filter(p=>p.publishedAt>=from&&p.publishedAt<=to);
  const generalIds=new Set([...journals.core,...journals.expansion].filter(j=>j.generalScope).map(j=>j.id));
  papers=papers.filter(p=>!generalIds.has(p.journalId)||isEcologicalGeneral(p));

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
  return { papers: scored, warnings: uniqueStrings(warnings), coverage };
}

export async function prepareReportCandidates({ from, to, journals, topics, options = {} }) {
  const expectedMinimum = options.kind === 'weekly' ? 8 : 4;
  return buildCandidateSet({ from, to, journals, topics, options: { ...options, expectedMinimum } });
}

export async function selectAndSummarize({ candidates, historyDois = [], topics, kind, options = {} }) {
  const evaluated=await evaluateTopicCandidates(candidates,options);
  const ranked=sortByRanking(evaluated.papers);
  const selection=kind==='monthly'?selectMonthly(ranked):selectPapers(ranked,{kind,historyDois});
  if(kind==='monthly'){
    const analysis=await analyzeMonthly(selection.papers,options);
    return {...selection,...analysis,warnings:[...evaluated.warnings,...analysis.warnings],llmUsed:evaluated.llmUsed||analysis.llmUsed};
  }
  return {...selection,papers:finalizeSummaries(selection.papers),warnings:evaluated.warnings,llmUsed:evaluated.llmUsed,budget:evaluated.budget};
}

export async function generateReport({ kind, date, reportId, period, journals, topics, options = {} }) {
  if(kind==='monthly'&&options.write!==false&&!options.revise){try{const existing=await readReport(kind,reportId);if(existing.status==='archived')throw new Error('归档月报仅允许明确修订');}catch(e){if(e.code!=='ENOENT')throw e;}}
  options.budget ||= createBudget();
  options.date=date;
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
    criteriaVersion:CRITERIA.version,
    status:kind==='monthly'?(options.status||'provisional'):undefined,
    monthlySynthesis:selected.monthlySynthesis,
    methodology:{scoreWeights:CRITERIA.weights,policy:'主线优先；根系分泌物机制参考；可行性待核实；期刊名气不加分；证据不足明确降级。'},
    diagnostics: {
      ...selected.diagnostics,budget:selected.budget,

      llmUsed: selected.llmUsed,
      sourceCandidateCount: candidateSet.papers.length, coverage:candidateSet.coverage
    }
  });
  if (options.write !== false) await writeReport(report,{revise:options.revise});
  return report;
}

export function isEcologicalGeneral(paper) {
 const text=`${paper.title} ${paper.abstract||''} ${(paper.subjects||[]).join(' ')}`.toLowerCase().replace(/random forest\w*/g,'');
 const anchor=/\b(ecolog\w*|ecosystem\w*|soil\w*|forest\w*|biodiversity|biogeochem\w*|rhizosphere|litter|deadwood|vegetation|food web|plant communit\w*)\b/;
 return anchor.test(text);
}
