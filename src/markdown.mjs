import { escapeMarkdown } from './text.mjs';

function scoreLine(valueScores) {
  return ['advisor', 'strategy', 'application', 'interdisciplinary', 'frontier']
    .map((key) => `${key}:${valueScores?.[key] ?? 0}`)
    .join(' / ');
}

export function reportToMarkdown(report) {
  const lines = [`# ${report.selectionTitle}`, ''];
  if (report.period) lines.push(`**时间范围：** ${report.period.from} 至 ${report.period.to}`, '');
  lines.push(`**推荐篇数：** ${report.paperCount}`, '');
  for (const paper of report.papers || []) {
    lines.push(`## ${paper.rank}. ${escapeMarkdown(paper.title)}`, '');
    lines.push(`- **期刊：** ${escapeMarkdown(paper.journal)}`);
    lines.push(`- **发布日期：** ${paper.publishedAt}`);
    lines.push(`- **关键词：** ${(paper.keywords || []).map(escapeMarkdown).join('、')}`);
    lines.push(`- **综合评分：** ${paper.totalScore}/100（${scoreLine(paper.valueScores)}）`);
    lines.push(`- **推荐理由：** ${escapeMarkdown(paper.recommendationReason)}`);
    lines.push(`- **论文链接：** ${paper.oaUrl || paper.doiUrl}`);
    if (paper.essence) {
      lines.push(`- **解决的问题：** ${escapeMarkdown(paper.essence.problem)}`);
      lines.push(`- **实验设计：** ${escapeMarkdown(paper.essence.design)}`);
      lines.push(`- **创新点：** ${escapeMarkdown(paper.essence.innovation)}`);
      lines.push(`- **可借鉴思路：** ${escapeMarkdown(paper.essence.transferableIdeas)}`);
      lines.push(`- **局限：** ${escapeMarkdown(paper.essence.limitations)}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
