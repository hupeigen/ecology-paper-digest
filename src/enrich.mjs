import { request, requestJson, readLimitedText } from './http.mjs';
import { normalizeDoi, stripHtml, truncate, uniqueStrings } from './text.mjs';

const OPENALEX_BASE = 'https://api.openalex.org';
const UNPAYWALL_BASE = 'https://api.unpaywall.org/v2';
const DOAJ_BASE = 'https://doaj.org/api/search/articles';

function reconstructAbstract(index) {
  if (!index || typeof index !== 'object') return '';
  const positions = [];
  for (const [word, indices] of Object.entries(index)) {
    for (const indexValue of Array.isArray(indices) ? indices : []) positions.push([Number(indexValue), word]);
  }
  return positions
    .filter(([position]) => Number.isFinite(position))
    .sort((a, b) => a[0] - b[0])
    .map(([, word]) => word)
    .join(' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function openAlexUrl(dois) {
  const filter = `doi:${dois.join('|')}`;
  const params = new URLSearchParams({
    filter,
    'per-page': String(Math.min(dois.length, 50)),
    select: 'id,doi,title,publication_date,type,primary_location,best_oa_location,open_access,abstract_inverted_index,cited_by_count,topics,keywords,is_retracted'
  });
  return `${OPENALEX_BASE}/works?${params}`;
}

export async function fetchOpenAlexBatch(papers, options = {}) {
  const requestOptions = options.requestOptions || {};
  const byDoi = new Map();
  const warnings = [];
  const valid = papers.filter((paper) => paper.doi).slice(0, 200);
  for (let offset = 0; offset < valid.length; offset += 50) {
    const chunk = valid.slice(offset, offset + 50);
    try {
      const payload = await requestJson(openAlexUrl(chunk.map((paper) => paper.doi)), {
        ...requestOptions,
        timeoutMs: requestOptions.timeoutMs ?? 25_000,
        headers: { accept: 'application/json', ...(requestOptions.headers || {}) }
      });
      for (const work of payload?.results || []) byDoi.set(normalizeDoi(work.doi), work);
    } catch (error) {
      warnings.push(`OpenAlex 批次 ${Math.floor(offset / 50) + 1} 失败：${error.message}`);
    }
    if (offset + 50 < valid.length) await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return { byDoi, warnings };
}

function openAlexEnrichment(paper, work) {
  if (!work) return paper;
  const abstract = reconstructAbstract(work.abstract_inverted_index);
  const oaUrl = work?.best_oa_location?.pdf_url
    || work?.best_oa_location?.landing_page_url
    || work?.open_access?.oa_url
    || paper.oaUrl
    || null;
  const keywords = uniqueStrings([
    ...(work.keywords || []).map((item) => item.display_name || item.keyword),
    ...(work.topics || []).map((item) => item.display_name)
  ]);
  return {
    ...paper,
    title: paper.title || stripHtml(work.title),
    abstract: abstract.length > (paper.abstract || '').length ? abstract : paper.abstract,
    hasAbstract: Boolean(abstract || paper.abstract),
    oaUrl,
    isOpenAccess: Boolean(work?.open_access?.is_oa || oaUrl),
    citedByCount: Math.max(Number(paper.citedByCount ?? 0), Number(work.cited_by_count ?? 0)),
    keywords: uniqueStrings([...paper.keywords, ...keywords]).slice(0, 12),
    isRetracted: Boolean(work.is_retracted),
    sources: [...(paper.sources || []), { name: 'OpenAlex', url: work.id }]
  };
}

function parseMetaTags(html) {
  const values = {};
  for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = match[0];
    const name = /(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content\s*=\s*["']([\s\S]*?)["']/i.exec(tag)?.[1];
    if (name && content) values[name] = stripHtml(content);
  }
  return values;
}

function parseJsonLdDescription(html) {
  const descriptions = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(stripHtml(match[1]));
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (typeof item?.description === 'string') descriptions.push(cleanAbstractCandidate(item.description));
      }
    } catch {
      // Invalid JSON-LD is expected on some publisher pages.
    }
  }
  return descriptions;
}

function cleanAbstractCandidate(value) {
  const text = stripHtml(value).replace(/^(abstract|summary)\s*[:\-]\s*/i, '').trim();
  if (text.length < 80 || text.length > 8000 || /cookie|javascript|access options|sign in/i.test(text)) return '';
  return text;
}

export function parseLandingMetadata(html) {
  const tags = parseMetaTags(html);
  const candidates = [
    tags['citation_abstract'], tags['dc.description'], tags['dcterms.abstract'],
    tags['og:description'], tags.description, ...parseJsonLdDescription(html)
  ].map(cleanAbstractCandidate).filter(Boolean);
  candidates.sort((a, b) => b.length - a.length);
  return {
    abstract: truncate(candidates[0] || '', 8000),
    pdfUrl: tags['citation_pdf_url'] || null,
    title: tags['citation_title'] || tags['og:title'] || null
  };
}

export async function fetchLandingMetadata(paper, options = {}) {
  const requestOptions = options.requestOptions || {};
  const response = await request(paper.landingUrl || paper.doiUrl, {
    ...requestOptions,
    timeoutMs: requestOptions.timeoutMs ?? 15_000,
    redirect: 'follow',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      ...(requestOptions.headers || {})
    }
  });
  const html = await readLimitedText(response, options.maxBytes ?? 1_200_000);
  return parseLandingMetadata(html);
}

export async function fetchUnpaywall(paper, email, options = {}) {
  if (!paper.doi || !email) return null;
  const url = `${UNPAYWALL_BASE}/${encodeURIComponent(paper.doi)}?email=${encodeURIComponent(email)}`;
  const payload = await requestJson(url, options.requestOptions || {});
  const location = payload?.best_oa_location;
  return {
    isOpenAccess: Boolean(payload?.is_oa),
    oaUrl: location?.url_for_pdf || location?.url || null,
    oaStatus: payload?.oa_status || null
  };
}

export async function fetchDoajRecord(paper, options = {}) {
  if (!paper.doi) return null;
  const query = encodeURIComponent(`doi:${paper.doi}`);
  const payload = await requestJson(`${DOAJ_BASE}/${query}`, options.requestOptions || {});
  const result = payload?.results?.[0];
  if (!result) return null;
  return {
    abstract: stripHtml(result.bibjson?.abstract || ''),
    keywords: uniqueStrings(result.bibjson?.keywords || []),
    url: result.bibjson?.link?.[0]?.url || null
  };
}

export async function enrichPapers(papers, options = {}) {
  const warnings = [];
  const { byDoi, warnings: openAlexWarnings } = await fetchOpenAlexBatch(papers, options);
  warnings.push(...openAlexWarnings);
  let enriched = papers.map((paper) => openAlexEnrichment(paper, byDoi.get(normalizeDoi(paper.doi))));

  const contactEmail = String(options.contactEmail ?? '').trim();
  if (contactEmail) {
    for (const paper of enriched.slice(0, Math.min(enriched.length, options.maxUnpaywall ?? 30))) {
      try {
        const result = await fetchUnpaywall(paper, contactEmail, options);
        if (result) {
          paper.isOpenAccess = result.isOpenAccess || paper.isOpenAccess;
          paper.oaUrl = paper.oaUrl || result.oaUrl;
          paper.oaStatus = result.oaStatus;
        }
      } catch (error) {
        warnings.push(`Unpaywall ${paper.doi} 失败：${error.message}`);
      }
    }
  }

  const missingAbstract = enriched.filter((paper) => !paper.hasAbstract).slice(0, options.maxDoaj ?? 5);
  for (const paper of missingAbstract) {
    try {
      const result = await fetchDoajRecord(paper, options);
      if (result?.abstract) {
        paper.abstract = result.abstract;
        paper.hasAbstract = true;
        paper.oaUrl = paper.oaUrl || result.url;
        paper.keywords = uniqueStrings([...paper.keywords, ...result.keywords]);
        paper.sources.push({ name: 'DOAJ', url: `https://doaj.org/api/search/articles/${encodeURIComponent(`doi:${paper.doi}`)}` });
      }
    } catch (error) {
      warnings.push(`DOAJ ${paper.doi} 失败：${error.message}`);
    }
  }

  const landingTargets = enriched.filter((paper) => !paper.hasAbstract || !paper.pdfUrl).slice(0, options.maxLanding ?? 12);
  for (const paper of landingTargets) {
    try {
      const result = await fetchLandingMetadata(paper, options);
      if (result.abstract && !paper.hasAbstract) {
        paper.abstract = result.abstract;
        paper.hasAbstract = true;
        paper.sources.push({ name: 'Publisher landing page', url: paper.landingUrl || paper.doiUrl });
      }
      if (result.pdfUrl) {
        paper.pdfUrl = paper.pdfUrl || result.pdfUrl;
        paper.oaUrl = paper.oaUrl || result.pdfUrl;
      }
    } catch (error) {
      warnings.push(`公开摘要页 ${paper.doi} 失败：${error.message}`);
    }
  }
  return { papers: enriched, warnings };
}

export { reconstructAbstract };
