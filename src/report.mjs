import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REPORTS_DIR } from './config.mjs';
import { shiftDate } from './dates.mjs';
import { CRITERIA } from './criteria.mjs';

export const INDEX_PATH = path.join(REPORTS_DIR, 'index.json');
export const DEFAULT_INDEX = Object.freeze({ version: 1, updatedAt: null, daily: [], weekly: [], monthly: [] });

async function atomicJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, filePath);
}

export async function readIndex(rootDir=REPORTS_DIR) {
  try {
    const value = JSON.parse(await readFile(path.join(rootDir,'index.json'), 'utf8'));
    return {
      version: value.version || 1,
      updatedAt: value.updatedAt || null,
      daily: Array.isArray(value.daily) ? value.daily : [],
      weekly: Array.isArray(value.weekly) ? value.weekly : [],
      monthly: Array.isArray(value.monthly) ? value.monthly : []
    };
  } catch (error) {
    if(error.code!=='ENOENT')throw error;
    return structuredClone(DEFAULT_INDEX);
  }
}

export function publicPaper(paper, rank) {
  return {
    rank,
    ...(paper.criteriaVersion?{criteriaVersion:paper.criteriaVersion,scoreReasons:paper.scoreReasons,evidenceLevel:paper.evidenceLevel,readingPriority:paper.readingPriority,deepRead:paper.deepRead,feasibility:paper.feasibility,selectionTrack:paper.selectionTrack}:{}),
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

export function buildReport({ kind, reportId, date, period, papers, generatedAt = new Date().toISOString(), warnings = [], notes = [], diagnostics = {}, status, criteriaVersion=papers[0]?.criteriaVersion,monthlySynthesis,methodology }) {
  const publicPapers = papers.map((paper, index) => publicPaper(paper, index + 1));
  return {
    version: criteriaVersion?2:1,
    ...(criteriaVersion?{criteriaVersion}:{}),
    ...(status?{status}:{}),
    ...(monthlySynthesis?{monthlySynthesis}:{}),
    kind,
    reportId,
    date,
    period,
    generatedAt,
    selectionTitle:kind==='monthly'?`生态论文雷达月度精选 · ${reportId}`: kind === 'weekly' ? `生态学高价值论文周报 · ${period.from} 至 ${period.to}` : `生态学高价值论文日报 · ${date}`,
    paperCount: publicPapers.length,
    papers: publicPapers,
    diagnostics,
    warnings: [...new Set(warnings.filter(Boolean))],
    notes: [...new Set(notes.filter(Boolean))],
    methodology: methodology || (criteriaVersion?{scoreWeights:CRITERIA.weights,policy:'主线优先；证据不足降级；可行性待核实；期刊名气不加分。'}:{
      scoreWeights: { advisor: 30, strategy: 20, application: 20, interdisciplinary: 15, frontier: 15 },
      policy: '原创研究优先；摘要不足时明确标注；报告不公开完整摘要或全文，不绕过付费墙。'
    })
  };
}

export function reportFile(kind, reportId, rootDir=REPORTS_DIR) {
  if(!['daily','weekly','monthly'].includes(kind)||!/^[-A-Za-z0-9]+$/.test(reportId))throw new Error('报告类型或编号无效');
  if(kind==='monthly'&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(reportId))throw new Error('无效月报编号');
  return path.join(rootDir, kind, `${reportId}.json`);
}

function indexEntry(report, relativePath) {
  return {
    kind: report.kind,
    status:report.status,criteriaVersion:report.criteriaVersion,revisedAt:report.revisedAt,
    searchText:report.papers.map(p=>[p.title,p.recommendationReason,...(p.keywords||[])].join(' ')).join(' '),
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

export async function writeReport(report,{revise=false,rootDir=REPORTS_DIR}={}) {
  const filePath=reportFile(report.kind,report.reportId,rootDir);
  const index=await readIndex(rootDir);
  let existing=null;
  try{existing=await readReport(report.kind,report.reportId,rootDir);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(report.kind==='monthly'&&existing?.status==='archived'){
    if(!revise)throw new Error('归档月报仅允许通过 --revise 明确修订');
    const stamp=new Date().toISOString();
    const backup=path.join(rootDir,'revisions','monthly',report.reportId,stamp.replace(/[:.]/g,'-')+'.json');
    await atomicJson(backup,existing);
    report.status='archived';report.revisedAt=stamp;report.revisionHistory=[...(existing.revisionHistory||[]),{revisedAt:stamp,previousGeneratedAt:existing.generatedAt,path:path.relative(rootDir,backup).replaceAll('\\','/')}];
  }
  const relativePath=path.relative(rootDir,filePath),entry=indexEntry(report,relativePath);
  const collection=index[report.kind];const replacement=collection.findIndex(item=>item.reportId===report.reportId);
  if(replacement>=0)collection[replacement]=entry;else collection.push(entry);
  collection.sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.generatedAt).localeCompare(String(a.generatedAt)));
  index.updatedAt=report.generatedAt;
  await atomicJson(filePath,report);
  try{await atomicJson(path.join(rootDir,'index.json'),index);}catch(e){if(existing)await atomicJson(filePath,existing);throw e;}
  return {filePath,index};
}
export async function readReport(kind, reportId,rootDir=REPORTS_DIR) {
 return JSON.parse(await readFile(reportFile(kind,reportId,rootDir),'utf8'));
}

export function recentHistoryDois(index, date, days = 30, currentKind = 'daily') {
  const from = shiftDate(date, -(days - 1));
  const collection = currentKind === 'weekly' ? [] : index.daily;
  return [...new Set(collection
    .filter((entry) => entry.date >= from && entry.date < date)
    .flatMap((entry) => entry.paperDois || []))];
}

export { atomicJson };
