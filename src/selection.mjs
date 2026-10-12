import { sortByRanking } from './scoring.mjs';

function isAdvisorRelevant(paper) {
  return (paper.valueScores?.advisor?.score ?? 0) >= 18;
}

function isReview(paper) {
  return paper.articleType === 'review';
}

function fillSelection(candidates, options) {
  const selected = [];
  const deferred = [];
  const journalCounts = new Map();
  let reviewCount = 0;

  function canTake(paper) {
    if (selected.some((item) => item.doi === paper.doi)) return false;
    if ((journalCounts.get(paper.journalId) || 0) >= options.maxPerJournal) return false;
    if (isReview(paper) && reviewCount >= options.maxReviews) return false;
    return true;
  }

  function take(paper) {
    selected.push(paper);
    journalCounts.set(paper.journalId, (journalCounts.get(paper.journalId) || 0) + 1);
    if (isReview(paper)) reviewCount += 1;
  }

  const advisor = candidates.find((paper) => isAdvisorRelevant(paper));
  if (advisor && options.ensureAdvisor) take(advisor);
  if (options.ensureNonAdvisor) {
    const nonAdvisor = candidates.find((paper) => !isAdvisorRelevant(paper) && canTake(paper));
    if (nonAdvisor) take(nonAdvisor);
  }

  for (const paper of candidates) {
    if (selected.length >= options.target) break;
    if (!canTake(paper)) {
      if (isReview(paper) && reviewCount >= options.maxReviews) deferred.push(paper);
      continue;
    }
    take(paper);
  }

  if (selected.length < options.minimum) {
    for (const paper of deferred) {
      if (selected.length >= options.minimum) break;
      if (canTake(paper)) take(paper);
    }
  }

  return { papers: selected.sort((a, b) => (
    (b.rankingScore ?? 0) - (a.rankingScore ?? 0) || String(b.publishedAt).localeCompare(String(a.publishedAt))
  )), journalCounts, reviewCount };
}

export function selectPapers(candidates, options = {}) {
  const kind = options.kind === 'weekly' ? 'weekly' : 'daily';
  const target = kind === 'weekly' ? 8 : 5;
  const minimum = 4;
  const maxPerJournal = kind === 'weekly' ? 3 : 2;
  const maxReviews = kind === 'weekly' ? 2 : 1;
  const history = new Set((options.historyDois || []).map((doi) => String(doi).toLowerCase()));
  const eligible = candidates.filter((paper) => paper && paper.doi && paper.isEcologyRelevant !== false && !paper.isRetracted && !history.has(String(paper.doi).toLowerCase()));
  const core = sortByRanking(eligible.filter((paper) => paper.pool !== 'expansion'));
  const expansion = sortByRanking(eligible.filter((paper) => paper.pool === 'expansion'));
  const notes = [];

  const full=fillSelection(sortByRanking(eligible),{target,minimum,maxPerJournal,maxReviews,ensureAdvisor:false,ensureNonAdvisor:false});
  const selected=full.papers,journalCounts=full.journalCounts,reviewCount=full.reviewCount;
  const expansionUsed=selected.filter(p=>p.pool==='expansion').length;

  if (selected.length < minimum) notes.push(`仅找到 ${selected.length} 篇符合约束的论文，未使用低置信度文章凑数。`);
  else if (selected.length < target) notes.push(`本${kind === 'weekly' ? '周' : '日'}达到约束后仅有 ${selected.length} 篇，未使用低相关或低置信度文章凑数。`);
  if (eligible.length < minimum) notes.push(`近 30 天候选池只有 ${eligible.length} 篇符合基本条件。`);


  const advisorCount = selected.filter(isAdvisorRelevant).length;
  return {
    papers: selected,
    diagnostics: {
      kind,
      target,
      minimum,
      selectedCount: selected.length,
      candidateCount: eligible.length,
      coreCandidateCount: core.length,
      expansionCandidateCount: expansion.length,
      expansionUsed,
      advisorCount,
      reviewCount,
      journalCounts: Object.fromEntries(journalCounts),
      maxPerJournal,
      maxReviews
    },
    notes
  };
}
