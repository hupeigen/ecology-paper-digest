import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REPORTS_DIR } from './config.mjs';
import { shiftDate } from './dates.mjs';

export const INDEX_PATH = path.join(REPORTS_DIR, 'index.json');
export const DEFAULT_INDEX = Object.freeze({ version: 1, updatedAt: null, daily: [], weekly: [] });

async function atomicJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, filePath);
}

export async function readIndex() {
  try {
    const value = JSON.parse(await readFile(INDEX_PATH, 'utf8'));
    return {
      version: value.version || 1,
      updatedAt: value.updatedAt || null,
      daily: Array.isArray(value.daily) ? value.daily : [],
      weekly: Array.isArray(value.weekly) ? value.weekly : []
    };
  } catch {
    return structuredClone(DEFAULT_INDEX);
  }
}

export function publicPaper(paper, rank) {
  return {
    rank,
    doi: paper.doi,
    title: paper.title,
    authors: paper.authors,
    journal: paper.journal,
    publishedAt: paper.publishedAt,
    articleType: paper.articleType,
    doiUrl: paper.doiUrl,
    oaUrl: paper.oaUrl || null,
    isOpenAccess: Boolean(paper.isOpenAccess),
    keywords: paper.keywords,
    valueScores: Object.fromEntries(Object.entries(paper.valueScores || {}).map(([key, value]) => [key, value.score])),
    totalScore: paper.totalScore,
    recommendationReason: paper.recommendationReason,
    essence: paper.essence,
    methodSignals: paper.methodSignals || [],
    sources: (paper.sources || []).map((source) => ({ name: source.name, url: source.url }))
  };
}

export function buildReport({ kind, reportId, date, period, papers, generatedAt = new Date().toISOString(), warnings = [], notes = [], diagnostics = {} }) {
  const publicPapers = papers.map((paper, index) => publicPaper(paper, index + 1));
  return {
    version: 1,
    kind,
    reportId,
    date,
    period,
    generatedAt,
    selectionTitle: kind === 'weekly' ? `生态学高价值论文周报 · ${period.from} 至 ${period.to}` : `生态学高价值论文日报 · ${date}`,
    paperCount: publicPapers.length,
    papers: publicPapers,
    diagnostics,
    warnings: [...new Set(warnings.filter(Boolean))],
    notes: [...new Set(notes.filter(Boolean))],
    methodology: {
      scoreWeights: { advisor: 30, strategy: 20, application: 20, interdisciplinary: 15, frontier: 15 },
      policy: '原创研究优先；摘要不足时明确标注；报告不公开完整摘要或全文，不绕过付费墙。'
    }
  };
}

export function reportFile(kind, reportId) {
  const directory = kind === 'weekly' ? 'weekly' : 'daily';
  return path.join(REPORTS_DIR, directory, `${reportId}.json`);
}

function indexEntry(report, relativePath) {
  return {
    kind: report.kind,
    reportId: report.reportId,
    date: report.date,
    period: report.period,
    generatedAt: report.generatedAt,
    paperCount: report.paperCount,
    title: report.selectionTitle,
    path: relativePath.replaceAll('\\', '/'),
    journals: [...new Set(report.papers.map((paper) => paper.journal))],
    keywords: [...new Set(report.papers.flatMap((paper) => paper.keywords || []))].slice(0, 20),
    paperDois: report.papers.map((paper) => paper.doi),
    warnings: report.warnings
  };
}

export async function writeReport(report) {
  const filePath = reportFile(report.kind, report.reportId);
  await atomicJson(filePath, report);
  const index = await readIndex();
  const relativePath = path.relative(REPORTS_DIR, filePath);
  const entry = indexEntry(report, relativePath);
  const collection = report.kind === 'weekly' ? index.weekly : index.daily;
  const replacement = collection.findIndex((item) => item.reportId === report.reportId);
  if (replacement >= 0) collection[replacement] = entry;
  else collection.push(entry);
  collection.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.generatedAt).localeCompare(String(a.generatedAt)));
  index.updatedAt = report.generatedAt;
  await atomicJson(INDEX_PATH, index);
  return { filePath, index };
}

export async function readReport(kind, reportId) {
  return JSON.parse(await readFile(reportFile(kind, reportId), 'utf8'));
}

export function recentHistoryDois(index, date, days = 30, currentKind = 'daily') {
  const from = shiftDate(date, -(days - 1));
  const collection = currentKind === 'weekly' ? [] : index.daily;
  return [...new Set(collection
    .filter((entry) => entry.date >= from && entry.date < date)
    .flatMap((entry) => entry.paperDois || []))];
}

export { atomicJson };
