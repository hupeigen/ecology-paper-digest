import { requestJson } from './http.mjs';
import { cleanTitle, normalizeDoi, stripHtml, uniqueStrings } from './text.mjs';

const CROSSREF_BASE = 'https://api.crossref.org';
const EXCLUDED_TYPES = new Set(['component', 'journal-issue', 'grant', 'editorial', 'erratum', 'correction', 'retraction']);
const EXCLUDED_TITLE = /^(issue information|front matter|back matter|editorial board|table of contents|correction|erratum|retraction)\b/i;

function dateFromParts(parts) {
  if (!Array.isArray(parts) || !Array.isArray(parts[0]) || parts[0].length < 3) return null;
  const [year, month = 1, day = 1] = parts[0].map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return Number.isNaN(Date.parse(`${key}T00:00:00Z`)) ? null : key;
}

function publicationDate(raw) {
  return dateFromParts(raw?.['published-online']?.['date-parts'])
    || dateFromParts(raw?.published?.['date-parts'])
    || dateFromParts(raw?.['published-print']?.['date-parts'])
    || dateFromParts(raw?.issued?.['date-parts']);
}

function normalizeAuthor(author) {
  const name = [author?.given, author?.family].filter(Boolean).join(' ').trim() || String(author?.name ?? '').trim();
  return name ? { name, orcid: String(author?.ORCID ?? '').trim() || null } : null;
}

function normalizeLinks(raw) {
  const links = Array.isArray(raw?.link) ? raw.link : [];
  const pdf = links.find((item) => String(item?.['content-type'] ?? '').includes('pdf'));
  return {
    pdfUrl: String(pdf?.URL ?? '').trim() || null,
    landingUrl: String(raw?.URL ?? '').trim() || null
  };
}

export function isEligibleArticle(raw) {
  const type = String(raw?.type ?? '').toLowerCase();
  const title = cleanTitle(raw?.title);
  if (!title || EXCLUDED_TYPES.has(type) || EXCLUDED_TITLE.test(title)) return false;
  if (/^(correction|erratum|retraction)\s+to\b/i.test(title)) return false;
  return true;
}

export function normalizeCrossrefWork(raw, journal) {
  if (!isEligibleArticle(raw)) return null;
  const doi = normalizeDoi(raw?.DOI);
  const title = cleanTitle(raw?.title);
  if (!doi || !title) return null;
  const publishedAt = publicationDate(raw);
  if (!publishedAt) return null;
  const authors = (Array.isArray(raw?.author) ? raw.author : []).map(normalizeAuthor).filter(Boolean).slice(0, 30);
  const abstract = stripHtml(raw?.abstract);
  const links = normalizeLinks(raw);
  const isReview = String(raw?.type ?? '').toLowerCase() === 'review-article';
  const subjects = uniqueStrings(raw?.subject);
  return {
    id: doi,
    doi,
    title,
    authors,
    journal: journal.name,
    journalId: journal.id,
    issns: uniqueStrings(raw?.ISSN),
    publisher: String(raw?.publisher ?? journal.publisher ?? '').trim(),
    publishedAt,
    articleType: isReview ? 'review' : 'research',
    doiUrl: `https://doi.org/${doi}`,
    landingUrl: links.landingUrl || `https://doi.org/${doi}`,
    pdfUrl: links.pdfUrl,
    oaUrl: links.pdfUrl,
    isOpenAccess: Boolean(links.pdfUrl),
    abstract,
    hasAbstract: Boolean(abstract),
    subjects,
    referenceCount: Number(raw?.['references-count'] ?? 0) || 0,
    citedByCount: Number(raw?.['is-referenced-by-count'] ?? 0) || 0,
    pool: journal.pool,
    sources: [{ name: 'Crossref', url: `https://api.crossref.org/works/${encodeURIComponent(doi)}` }]
  };
}

export function dedupePapers(papers) {
  const result = [];
  const seenDoi = new Set();
  const seenTitle = new Set();
  for (const paper of papers) {
    if (!paper) continue;
    const doi = normalizeDoi(paper.doi);
    const titleKey = `${String(paper.title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${paper.publishedAt?.slice(0, 4) ?? ''}`;
    if ((doi && seenDoi.has(doi)) || (!doi && seenTitle.has(titleKey))) continue;
    if (doi) seenDoi.add(doi);
    seenTitle.add(titleKey);
    result.push(paper);
  }
  return result;
}

export function crossrefWorksUrl(journal, from, to, options = {}) {
  const issn = journal.issns[0];
  const rows = Math.min(Number(options.rows ?? 100), 100);
  const offset = Math.max(Number(options.offset ?? 0), 0);
  const params = new URLSearchParams({
    filter: `from-pub-date:${from},until-pub-date:${to}`,
    rows: String(rows),
    offset: String(offset),
    sort: 'published',
    order: 'desc',
    select: 'DOI,title,author,abstract,container-title,ISSN,issued,published,published-online,published-print,type,URL,link,subject,references-count,is-referenced-by-count,license,publisher,update-to,relation'
  });
  const mailto = String(options.mailto ?? '').trim();
  if (mailto) params.set('mailto', mailto);
  return `${CROSSREF_BASE}/journals/${encodeURIComponent(issn)}/works?${params}`;
}

export async function fetchJournalWorks(journal, from, to, options = {}) {
  const requestOptions = options.requestOptions || {};
  const maxPages = Math.max(1, Math.min(Number(options.maxPages ?? 3), 5));
  const papers = [];
  const warnings = [];
  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * 100;
    const url = crossrefWorksUrl(journal, from, to, { offset, mailto: options.mailto });
    let payload;
    try {
      payload = await requestJson(url, {
        ...requestOptions,
        headers: { accept: 'application/json', ...(requestOptions.headers || {}) }
      });
    } catch (error) {
      warnings.push(`${journal.name} 第 ${page + 1} 页获取失败：${error.message}`);
      break;
    }
    const items = Array.isArray(payload?.message?.items) ? payload.message.items : [];
    for (const item of items) {
      const paper = normalizeCrossrefWork(item, journal);
      if (paper) papers.push(paper);
    }
    const total = Number(payload?.message?.['total-results'] ?? 0);
    if (items.length < 100 || (offset + items.length) >= total) break;
  }
  return { papers: dedupePapers(papers), warnings };
}

export async function fetchJournalPool(journals, from, to, options = {}) {
  const papers = [];
  const warnings = [];
  const delayMs = Math.max(0, Number(options.delayMs ?? 120));
  for (let index = 0; index < journals.length; index += 1) {
    const result = await fetchJournalWorks(journals[index], from, to, options);
    papers.push(...result.papers);
    warnings.push(...result.warnings);
    if (delayMs && index < journals.length - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { papers: dedupePapers(papers), warnings };
}

export { dateFromParts, publicationDate };

