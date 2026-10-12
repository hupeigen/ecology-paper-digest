import {escapeMarkdown} from './text.mjs';
const legacy={advisor:'导师方向',strategy:'国家战略',application:'应用价值',interdisciplinary:'跨学科',frontier:'前沿突破'};
const topic={relevance:'课题相关性',transferability:'实验与分析可迁移性',decomposition:'问题拆解价值',frontier:'前沿与候选空白'};
export function reportToMarkdown(report){
 const lines=[`# ${report.selectionTitle}`,'',`时间范围：${report.period?.from||report.date} 至 ${report.period?.to||report.date}`,`状态：${report.status||'历史报告'} · 标准：${report.criteriaVersion||'历史原始评分'}`,`推荐篇数：${report.paperCount}`,''];
 for(const v of [...(report.warnings||[]),...(report.notes||[])])lines.push(`- ${escapeMarkdown(v)}`);
 for(const p of report.papers||[]){lines.push('',`## ${p.rank}. ${escapeMarkdown(p.title)}`,'',`- 期刊：${p.journal}`,`- 发布日期：${p.publishedAt}`,`- DOI：[原文](${p.doiUrl})`,`- 综合评分：${p.totalScore}/100`,`- 推荐理由：${p.recommendationReason}`,`- 证据等级：${p.evidenceLevel||p.essence?.evidenceConfidence||'未标记'}`);
  for(const[k,v]of Object.entries(p.criteriaVersion?topic:legacy))lines.push(`- ${v}：${p.valueScores?.[k]||0}${p.scoreReasons?.[k]?`；${p.scoreReasons[k]}`:''}`);
  if(p.feasibility)lines.push(`- 可行性：${p.feasibility}`);if(p.readingPriority)lines.push(`- 阅读优先级：${p.readingPriority}`);
  const labels={problem:'核心问题',results:'主要结果',design:'研究设计',innovation:'创新点',transferableIdeas:'可借鉴思路',limitations:'结论边界'};
  for(const[k,label]of Object.entries(labels))if(p.essence?.[k])lines.push(`- ${label}：${p.essence[k]}`,...(p.essence.evidence?.[k]||[]).map(e=>`  [原文依据：${e.locator}](${e.url})`));
  if(p.deepRead){lines.push('',`### 深读（${p.deepRead.status} / ${p.deepRead.evidenceLevel}）`);for(const s of p.deepRead.sections||[])lines.push('',`#### ${s.label}`,s.text,...(s.evidence||[]).map(e=>`[${e.locator}](${e.url})`));lines.push(p.deepRead.necessaryConditions,p.deepRead.supplementsStatus);}
 }
 const syn=report.monthlySynthesis;if(syn){lines.push('','## 月度综合',`分析状态：${syn.status}`,`主题：${(syn.themes||[]).join('；')}`,`分歧：${(syn.disagreements||[]).join('；')}`);if(!syn.gaps?.length)lines.push('候选空白分析未完成。');for(const g of syn.gaps||[])lines.push('',`### ${g.question}`,`类型：${g.classification} · 补查：${g.searchStatus}`,`依据：${(g.basis||[]).map(b=>b.url).join('；')}`,`替代解释：${g.alternativeExplanation}`,`下一步验证：${g.nextValidation}`,g.boundary,...(g.comparators||[]).map(c=>`[${c.title}](${c.url})`));}
 return lines.filter(x=>x!==undefined).join('\n');
}
