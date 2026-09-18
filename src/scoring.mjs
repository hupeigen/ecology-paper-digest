import { truncate, uniqueStrings } from './text.mjs';

const DIMENSION_ORDER = ['advisor', 'strategy', 'application', 'interdisciplinary', 'frontier'];
const ECOLOGY_TERMS = [
  'ecology', 'ecological', 'ecosystem', 'soil', 'plant', 'forest', 'grassland', 'vegetation',
  'biodiversity', 'carbon cycle', 'soil carbon', 'carbon sink', 'carbon emission', 'climate',
  'greenhouse gas', 'root', 'rhizosphere', 'microbial community', 'microbiome', 'agriculture',
  'crop', 'land use', 'restoration', 'species', 'biogeochemical', 'nutrient cycling', 'food web'
];
const HUMAN_MEDICAL_TERMS = [
  'precision medicine', 'human-infecting', 'human disease', 'clinical', 'patient', 'cancer',
  'virus', 'viral infection', 'therapeutic', 'drug target', 'hospital'
];
const NARROW_SCOPE_JOURNALS = new Set(['imeta', 'eeh']);

function fitScore(title, abstract, subjects, journalId) {
  const titleText = normalized(title);
  const abstractText = normalized(abstract);
  const subjectText = normalized((subjects || []).join(' '));
  let score = 0;
  for (const term of ECOLOGY_TERMS) {
    if (termCount(titleText, term)) score += 18;
    if (termCount(abstractText, term)) score += 6;
    if (termCount(subjectText, term)) score += 14;
  }
  if (!NARROW_SCOPE_JOURNALS.has(journalId)) score = Math.max(score, 48);
  else score = Math.max(score, 16);
  const medicalHits = HUMAN_MEDICAL_TERMS.filter((term) => (
    termCount(titleText, term) || termCount(abstractText, term)
  )).length;
  if (medicalHits && score < 55) score -= medicalHits * 22;
  return Math.max(0, Math.min(100, score));
}

function normalized(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function termCount(text, term) {
  const needle = normalized(term);
  if (!needle) return 0;
  if (needle.includes(' ')) {
    let count = 0;
    let index = 0;
    while ((index = text.indexOf(needle, index)) >= 0) {
      count += 1;
      index += needle.length;
    }
    return count;
  }
  return text.split(/\s+/).filter((token) => token === needle).length;
}

export function scoreTermGroup(title, abstract, terms) {
  const titleText = normalized(title);
  const abstractText = normalized(abstract);
  const matched = [];
  let points = 0;
  for (const term of terms) {
    const titleHits = termCount(titleText, term);
    const abstractHits = termCount(abstractText, term);
    if (titleHits + abstractHits === 0) continue;
    matched.push(term);
    points += Math.min(titleHits, 2) * 18 + Math.min(abstractHits, 3) * 8;
  }
  return { score: Math.min(100, Math.round(points)), matched: uniqueStrings(matched) };
}

export function topicLabelsFor(paper, topics) {
  const text = normalized(`${paper.title} ${paper.abstract || ''} ${(paper.subjects || []).join(' ')}`);
  const labels = [];
  for (const [label, terms] of Object.entries(topics.topicLabels || {})) {
    if (terms.some((term) => text.includes(normalized(term)))) labels.push(label);
  }
  return labels.slice(0, 6);
}

export function methodSignalsFor(paper, topics) {
  const text = normalized(`${paper.title} ${paper.abstract || ''}`);
  return uniqueStrings((topics.methodTerms || []).filter((term) => text.includes(normalized(term)))).slice(0, 5);
}

export function topicKeywords(paper, topics) {
  return uniqueStrings([...(paper.keywords || []), ...topicLabelsFor(paper, topics), ...(paper.subjects || []).slice(0, 3)]).slice(0, 8);
}

export function scorePaper(paper, topics) {
  const valueScores = {};
  for (const dimension of DIMENSION_ORDER) {
    const result = scoreTermGroup(paper.title, paper.abstract, topics.terms[dimension]);
    let score = result.score;
    if (!paper.hasAbstract) score = Math.round(score * 0.55);
    valueScores[dimension] = { score, matched: result.matched.slice(0, 8) };
  }
  const totalScore = Math.round(DIMENSION_ORDER.reduce((sum, dimension) => (
    sum + valueScores[dimension].score * topics.weights[dimension]
  ), 0));
  const matchedTerms = DIMENSION_ORDER.flatMap((dimension) => valueScores[dimension].matched);
  const rankingScore = totalScore
    + recencyBonus(paper.publishedAt, new Date())
    + (paper.isOpenAccess ? 0.7 : 0)
    + (paper.hasAbstract ? 0.8 : 0);
  const topDimensions = DIMENSION_ORDER
    .map((key) => ({ key, score: valueScores[key].score }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  const recommendationReason = topDimensions.length
    ? `重点体现${topDimensions.map((item) => topics.dimensionLabels[item.key]).join('与')}；命中“${matchedTerms.slice(0, 4).join('、')}”等信号。`
    : '主题信号较弱，因期刊范围、时效性或方法价值进入候选，建议结合摘要判断。';
  const ecologyFit = fitScore(paper.title, paper.abstract, paper.subjects, paper.journalId);

  return {
    ...paper,
    ecologyFit,
    isEcologyRelevant: ecologyFit >= 24,
    keywords: topicKeywords(paper, topics),
    valueScores,
    totalScore,
    rankingScore,
    recommendationReason: truncate(recommendationReason, 180),
    methodSignals: methodSignalsFor(paper, topics),
    scoringMode: 'rules',
    scoringConfidence: paper.hasAbstract ? 1 : 0.55
  };
}

export function recencyBonus(publishedAt, now = new Date()) {
  const time = Date.parse(`${publishedAt}T00:00:00Z`);
  if (!Number.isFinite(time)) return 0;
  const days = Math.max(0, Math.floor((now.getTime() - time) / 86_400_000));
  if (days <= 2) return 3;
  if (days <= 7) return 2.4;
  if (days <= 14) return 1.6;
  if (days <= 21) return 0.9;
  return 0.3;
}

export function mergeLlmScores(paper, assessment, topics) {
  if (!assessment?.valueScores || typeof assessment.valueScores !== 'object') return paper;
  const valueScores = { ...paper.valueScores };
  let changed = false;
  for (const dimension of DIMENSION_ORDER) {
    const raw = Number(assessment.valueScores[dimension]);
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) continue;
    valueScores[dimension] = {
      score: Math.round(raw),
      matched: valueScores[dimension]?.matched || []
    };
    changed = true;
  }
  if (!changed) return paper;
  const totalScore = Math.round(DIMENSION_ORDER.reduce((sum, dimension) => (
    sum + valueScores[dimension].score * topics.weights[dimension]
  ), 0));
  return {
    ...paper,
    valueScores,
    totalScore,
    rankingScore: totalScore + recencyBonus(paper.publishedAt) + (paper.isOpenAccess ? 0.7 : 0) + (paper.hasAbstract ? 0.8 : 0),
    recommendationReason: truncate(assessment.recommendationReason || paper.recommendationReason, 220),
    keywords: uniqueStrings([...(assessment.keywords || []), ...paper.keywords]).slice(0, 8),
    scoringMode: 'rules+llm',
    scoringConfidence: paper.hasAbstract ? 1 : 0.55
  };
}

export function sortByRanking(papers) {
  return [...papers].sort((a, b) => (
    (b.rankingScore ?? b.totalScore ?? 0) - (a.rankingScore ?? a.totalScore ?? 0)
    || String(b.publishedAt).localeCompare(String(a.publishedAt))
    || String(a.title).localeCompare(String(b.title))
  ));
}

export { DIMENSION_ORDER };

