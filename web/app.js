import {FEEDBACK_KEY,importFeedback,normalizeFeedback,mergeFeedback} from './feedback.js';
const DIMENSIONS = {
  advisor: '导师方向',
  strategy: '国家战略',
  application: '应用价值',
  interdisciplinary: '跨学科',
  frontier: '前沿突破'
};
const TOPIC_DIMENSIONS={relevance:'课题相关性',transferability:'实验与分析可迁移性',decomposition:'问题拆解价值',frontier:'前沿与候选空白'};
let feedback={version:1,items:{}};
try{const saved=localStorage.getItem(FEEDBACK_KEY);if(saved)feedback=importFeedback(saved);}catch{}
function persistFeedback(next){try{localStorage.setItem(FEEDBACK_KEY,JSON.stringify(next));feedback=next;return true;}catch{alert('浏览器无法保存反馈，请检查存储权限。');return false;}}
const state = { index: null, report: null, route: { view: 'latest' }, query: '' };
const content = document.querySelector('#content');
const reportList = document.querySelector('#reportList');
const freshness = document.querySelector('#freshness');
const searchInput = document.querySelector('#searchInput');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function safeUrl(value) {
  try {
    const url = new URL(String(value), location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch { return '#'; }
}

function formatDateTime(value) {
  if (!value) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return '日期未知';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric'
  }).format(new Date(`${value}T12:00:00+08:00`));
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`读取失败：HTTP ${response.status}`);
  return response.json();
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'latest';
  const [view, id] = raw.split('/');
  state.route = { view: ['latest', 'weekly', 'archive', 'daily', 'monthly'].includes(view) ? view : 'latest', id: id || null };
}

function entriesFor(view) {
  if (view === 'monthly') return state.index.monthly||[];
  if (view === 'weekly') return state.index.weekly;
  return state.index.daily;
}

function resolveEntry() {
  const { view, id } = state.route;
  if (view === 'archive') return null;
  if (view === 'monthly') return state.index.monthly.find(item=>item.reportId===id)||state.index.monthly[0]||null;
  if (view === 'weekly') return state.index.weekly.find((item) => item.reportId === id) || state.index.weekly[0] || null;
  if (view === 'daily') return state.index.daily.find((item) => item.reportId === id) || state.index.daily[0] || null;
  return state.index.daily[0] || null;
}

function activeReportKey() {
  return state.report ? `${state.report.kind}/${state.report.reportId}` : '';
}

function reportMatches(entry) {
  if (!state.query) return true;
  const haystack = [entry.title, entry.date, entry.searchText||'', ...(entry.journals || []), ...(entry.keywords || [])].join(' ').toLowerCase();
  return haystack.includes(state.query.toLowerCase());
}

function renderSidebar() {
  const sections = [
    ['日报', state.index.daily],
    ['周报', state.index.weekly], ['月报',state.index.monthly||[]]
  ];
  const html = [];
  for (const [label, allEntries] of sections) {
    const entries = allEntries.filter(reportMatches).slice(0, 40);
    if (!entries.length) continue;
    html.push(`<p class="list-section-title">${label}</p>`);
    for (const entry of entries) {
      const key = `${entry.kind}/${entry.reportId}`;
      const active = key === activeReportKey() ? ' active' : '';
      html.push(`<a class="report-link${active}" href="./#/${entry.kind}/${encodeURIComponent(entry.reportId)}">
        <strong>${escapeHtml(entry.kind === 'monthly'?`${entry.reportId} 月报`:entry.kind === 'weekly' ? `${entry.reportId} 周报` : formatDate(entry.date))}</strong>
        <span>${entry.paperCount} 篇 · ${escapeHtml(entry.journals?.slice(0, 2).join('、') || '期刊更新中')}</span>
      </a>`);
    }
  }
  reportList.innerHTML = html.join('') || '<div class="empty-state"><p>没有匹配的报告</p></div>';
}

function scoreHtml(valueScores, totalScore, paper={}) {
  const tags = Object.entries(paper.criteriaVersion?TOPIC_DIMENSIONS:DIMENSIONS).map(([key, label]) => (
    `<span class="score-tag">${label} ${Number(valueScores?.[key] || 0)}</span>`
  ));
  return `<div class="score-row"><span class="score-tag total">综合 ${Number(totalScore || 0)}/100</span>${tags.join('')}</div>`;
}

function evidenceLabel(paper) {
  if(paper.essence?.summaryMode==='human-reviewed-abstract')return '公开摘要 · 人工核查（全文深读未完成）';
  if(paper.deepRead?.status==='complete')return '全文 · 深读完成（机器证据校验）';
  if(paper.deepRead?.status==='partial')return '全文 · 部分深读支持不足';
  if(paper.deepRead?.status==='abstract-only')return '摘要级 · 深读未完成';
  if (paper.essence?.evidenceConfidence === 'metadata-only') return '仅题录，摘要不可得';
  if (paper.essence?.summaryMode === 'llm') return '公开摘要 · LLM辅助总结';
  return '公开摘要 · 规则总结';
}

function paperCard(paper) {
  const authors = (paper.authors || []).slice(0, 4).map((author) => author.name).filter(Boolean);
  const authorText = authors.length ? `${authors.join('、')}${paper.authors.length > 4 ? ' 等' : ''}` : '作者信息未提供';
  const links = [
    `<a class="primary-button" href="${safeUrl(paper.doiUrl)}" target="_blank" rel="noopener noreferrer">DOI 原文</a>`,
    paper.oaUrl ? `<a class="ghost-button" href="${safeUrl(paper.oaUrl)}" target="_blank" rel="noopener noreferrer">开放全文</a>` : ''
  ].join('');
  const keywordHtml = (paper.keywords || []).slice(0, 7).map((keyword) => `<span class="keyword">${escapeHtml(keyword)}</span>`).join('');
  const essence = paper.essence || {};
  return `<article class="paper-card" id="paper-${paper.rank}">
    <div class="paper-top">
      <div class="rank-badge">${paper.rank}</div>
      <div>
        <div class="paper-type">${paper.articleType === 'review' ? 'REVIEW / 综述' : 'RESEARCH / 原创研究'}</div>
        <h2><a href="${safeUrl(paper.doiUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(paper.title)}</a></h2>
        <p class="paper-byline"><strong>${escapeHtml(paper.journal)}</strong> · ${formatDate(paper.publishedAt)}<br>${escapeHtml(authorText)}</p>
      </div>
    </div>
    <p class="recommendation"><strong>推荐理由：</strong>${escapeHtml(paper.recommendationReason)}</p>
    <div class="keyword-row">${keywordHtml}</div>
    ${scoreHtml(paper.valueScores, paper.totalScore,paper)}
    ${paper.scoreReasons?`<details><summary>四项评分依据</summary>${Object.entries(paper.scoreReasons).map(([k,v])=>`<p><strong>${escapeHtml(TOPIC_DIMENSIONS[k]||k)}：</strong>${escapeHtml(v)}</p>`).join('')}</details>`:''}
    ${paper.feasibility?`<p>${escapeHtml(paper.feasibility)} · 阅读优先级：${escapeHtml(paper.readingPriority||'按评分排序')}</p>`:''}
    <div class="essence-grid">
      <section class="essence-block"><h3>要解决什么问题</h3><p>${escapeHtml(essence.problem)}</p>${evidenceLinks(paper,"problem")}</section>
      <section class="essence-block"><h3>实验或研究设计</h3><p>${escapeHtml(essence.design)}</p>${evidenceLinks(paper,"design")}</section>
      <section class="essence-block"><h3>创新点</h3><p>${escapeHtml(essence.innovation)}</p>${evidenceLinks(paper,"innovation")}</section>
      <section class="essence-block"><h3>可以借鉴的思路</h3><p>${escapeHtml(essence.transferableIdeas)}</p>${evidenceLinks(paper,"transferableIdeas")}</section>
      <section class="essence-block wide"><h3>局限与阅读提示</h3><p>${escapeHtml(essence.limitations)}</p>${evidenceLinks(paper,"limitations")}</section>
    </div>
    ${paper.essence?.results?`<section class="essence-block"><h3>主要结果</h3><p>${escapeHtml(paper.essence.results)}</p>${evidenceLinks(paper,"results")}</section>`:''}
    ${deepHtml(paper.deepRead)}
    ${feedbackHtml(paper)}
    <div class="card-footer">
      <small>${escapeHtml(evidenceLabel(paper))} · 评分用于组内阅读排序，不等同于论文质量定论</small>
      <div class="report-actions">${links}<button class="copy-button" type="button" data-copy-paper="${paper.rank}">复制摘要</button></div>
    </div>
  </article>`;
}

function renderReport(report) {
  const warnings = [...(report.warnings || []), ...(report.notes || [])];
  const notice = warnings.length
    ? `<div class="notice warning"><strong>数据说明：</strong> ${warnings.map(escapeHtml).join(' ')}</div>`
    : '';
  const period = report.kind !== 'daily' ? `${report.period.from} 至 ${report.period.to}` : report.date;
  content.innerHTML = `<header class="report-header">
    <p class="eyebrow">${report.kind==='monthly'?'MONTHLY DIGEST':report.kind === 'weekly' ? 'WEEKLY DIGEST' : 'DAILY DIGEST'}</p>
    <h1>${escapeHtml(report.kind==='monthly'?'月度精选与选题启发':report.kind === 'weekly' ? '生态学高价值论文周报' : '生态学高价值论文日报')}</h1>
    <p>${report.criteriaVersion?'围绕亚热带森林干旱、凋落物与倒木分解及土壤碳效应，学习问题拆解和证据分析。根系分泌物保留为机制参考。':'历史报告：保留生成时的原始评价标准与评分。'}</p>
    <div class="report-meta">
      <span class="meta-chip">${escapeHtml(period)}</span>
      <span class="meta-chip">${report.paperCount} 篇推荐</span>
      ${report.status?`<span class="meta-chip">${report.status==='archived'?'归档':'暂定'}</span>`:''}
      ${report.criteriaVersion?`<span class="meta-chip">标准 ${escapeHtml(report.criteriaVersion)}</span>`:''}
      ${report.revisedAt?`<span class="meta-chip">修订 ${formatDateTime(report.revisedAt)}</span>`:''}
      <span class="meta-chip">候选池 ${Number(report.diagnostics?.candidateCount || 0)} 篇</span>
      <span class="meta-chip">${report.diagnostics?.llmUsed ? 'LLM增强' : '规则模式'}</span>
      <span class="meta-chip">更新 ${formatDateTime(report.generatedAt)}</span>
    </div>
    <div class="report-actions">
      <button class="primary-button" id="copyReport" type="button">复制整期 Markdown</button>
      <button class="ghost-button" id="printReport" type="button">打印 / 存为 PDF</button>
    </div>
  </header>
  ${report.kind==='monthly'?monthSelector(report):''}
  ${notice}
  ${coverageHtml(report.diagnostics?.coverage)}
  ${synthesisHtml(report.monthlySynthesis)}
  <div class="paper-grid">${report.papers.filter(paperMatches).map(paperCard).join('') || '<div class="empty-state"><h2>本批次暂无可推荐论文</h2><p>请查看数据说明或等待下一次更新。</p></div>'}</div>`;
}

function renderArchive() {
  const all = [...state.index.daily, ...state.index.weekly,...(state.index.monthly||[])]
    .filter(reportMatches)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.generatedAt).localeCompare(String(a.generatedAt)));
  const cards = all.map((entry) => `<a class="archive-card" href="./#/${entry.kind}/${encodeURIComponent(entry.reportId)}">
    <div class="paper-type">${entry.kind==='monthly'?'MONTHLY':entry.kind === 'weekly' ? 'WEEKLY' : 'DAILY'} · ${entry.paperCount} 篇</div>
    <h2>${escapeHtml(entry.kind === 'monthly'?`${entry.reportId} 月报`:entry.kind === 'weekly' ? `${entry.reportId} 周报` : formatDate(entry.date))}</h2>
    <p>${escapeHtml(entry.journals?.slice(0, 5).join('、') || '期刊信息更新中')}</p>
  </a>`).join('');
  content.innerHTML = `<header class="report-header">
    <p class="eyebrow">PERMANENT ARCHIVE</p>
    <h1>历史归档</h1>
    <p>所有日报、周报和月报永久保留。可使用左侧搜索框按标题、期刊或关键词筛选。</p>
    <div class="report-meta"><span class="meta-chip">日报 ${state.index.daily.length} 期</span><span class="meta-chip">周报 ${state.index.weekly.length} 期</span></div>
  </header><div class="archive-grid">${cards || '<div class="empty-state"><h2>没有匹配报告</h2></div>'}</div>`;
}

function showEmpty(message = '') {
  content.innerHTML = `<div class="empty-state"><span>∅</span><h2>暂无报告</h2><p>${escapeHtml(message || '首次数据更新完成后，日报、周报与月报会显示在这里。')}</p></div>`;
}

async function loadReport(entry) {
  content.innerHTML = '<div class="loading-card"><span class="loader"></span><p>正在读取报告…</p></div>';
  const report = await fetchJson(`./reports/${entry.path}`);
  state.report = report;
  renderReport(report);
  renderSidebar();
}

async function renderRoute() {
  parseHash();
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const active = link.dataset.nav === state.route.view
      || (state.route.view === 'daily' && link.dataset.nav === 'latest');
    link.classList.toggle('active', active);
  });
  if (state.route.view === 'archive') {
    state.report = null;
    renderArchive();
    renderSidebar();
    return;
  }
  const entry = resolveEntry();
  if (!entry) {
    state.report = null;
    showEmpty();
    renderSidebar();
    return;
  }
  await loadReport(entry);
}

function paperToMarkdown(paper) {
  const essence = paper.essence || {};
  return `## ${paper.rank}. ${paper.title}

- 期刊：${paper.journal}
- 发布日期：${paper.publishedAt}
- 关键词：${(paper.keywords || []).join('、')}
- 综合评分：${paper.totalScore}/100
- 推荐理由：${paper.recommendationReason}
- 链接：${paper.oaUrl || paper.doiUrl}
- 解决问题：${essence.problem || ''}
- 研究设计：${essence.design || ''}
- 创新点：${essence.innovation || ''}
- 可借鉴思路：${essence.transferableIdeas || ''}
- 局限：${essence.limitations || ''}
- 主要结果：${essence.results||''}
- 证据：${evidenceLabel(paper)}
- 可行性：${paper.feasibility||'待核实'}
${Object.entries(paper.scoreReasons||{}).map(([k,v])=>`- ${TOPIC_DIMENSIONS[k]||k}依据：${v}`).join('\n')}
${deepMarkdown(paper.deepRead)}`;
}

function reportToMarkdown() {
  if (!state.report) return '';
  return `# ${state.report.selectionTitle}\n\n状态：${state.report.status||'历史报告'} · 标准：${state.report.criteriaVersion||'历史原始标准'}\n\n${synthesisMarkdown(state.report.monthlySynthesis)}\n\n${state.report.papers.map(paperToMarkdown).join('\n\n')}`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

content.addEventListener('click', async (event) => {
  const reportButton = event.target.closest('#copyReport');
  if (reportButton && state.report) {
    await copyText(reportToMarkdown());
    reportButton.textContent = '已复制';
    setTimeout(() => { reportButton.textContent = '复制整期 Markdown'; }, 1400);
    return;
  }
  if (event.target.closest('#printReport')) window.print();
  const copyPaperButton = event.target.closest('[data-copy-paper]');
  if (copyPaperButton && state.report) {
    const paper = state.report.papers.find((item) => String(item.rank) === copyPaperButton.dataset.copyPaper);
    if (paper) {
      await copyText(paperToMarkdown(paper));
      copyPaperButton.textContent = '已复制';
      setTimeout(() => { copyPaperButton.textContent = '复制摘要'; }, 1400);
    }
  }
});

searchInput.addEventListener('input', () => {
  state.query = searchInput.value.trim();
  renderSidebar();
  if (state.route.view === 'archive') renderArchive();else if(state.report)renderReport(state.report);
});

window.addEventListener('hashchange', () => renderRoute().catch(showError));

function showError(error) {
  content.innerHTML = `<div class="empty-state"><span>!</span><h2>读取失败</h2><p>${escapeHtml(error.message)}</p></div>`;
}

async function init() {
  try {
    state.index = await fetchJson('./reports/index.json');
    state.index.monthly ||= [];
    const count = state.index.daily.length + state.index.weekly.length+state.index.monthly.length;
    freshness.textContent = count
      ? `共 ${count} 期 · 最近更新 ${formatDateTime(state.index.updatedAt)}`
      : '等待首次自动更新';
    renderSidebar();
    await renderRoute();
  } catch (error) {
    showError(error);
    freshness.textContent = '无法读取报告索引';
  }
}

init();

function paperMatches(p){return !state.query||[p.title,p.journal,p.recommendationReason,...(p.keywords||[])].join(' ').toLowerCase().includes(state.query.toLowerCase());}
function deepHtml(deep){if(!deep)return '';return `<details class="deep-read" ${deep.status==='complete'?'open':''}><summary>深读 ${escapeHtml({complete:'完成',partial:'部分待核验','abstract-only':'未完成（仅摘要）','not-run':'未运行'}[deep.status]||deep.status)}</summary>${(deep.sections||[]).map(s=>`<section><h3>${escapeHtml(s.label)}</h3><p>${escapeHtml(s.text)}</p>${(s.evidence||[]).map(e=>`<a href="${safeUrl(e.url)}" target="_blank" rel="noopener noreferrer">原文依据：${escapeHtml(e.locator)}</a>`).join(' ')}</section>`).join('')}<p>${escapeHtml(deep.necessaryConditions)}</p><p>${escapeHtml(deep.supplementsStatus)}</p></details>`;}
function deepMarkdown(d){return d?`\n深读状态：${d.status} · ${d.evidenceLevel}\n${(d.sections||[]).map(s=>`### ${s.label}\n${s.text}\n${(s.evidence||[]).map(e=>`[${e.locator}](${e.url})`).join(' ')}`).join('\n')}\n${d.necessaryConditions}\n${d.supplementsStatus}`:'';}
function synthesisHtml(v){if(!v)return '';return `<section class="monthly-synthesis"><h2>月度综合</h2><p>分析状态：${escapeHtml(v.status)}；选题线索均需进一步验证。</p><h3>关注主题</h3><p>${(v.themes||[]).map(escapeHtml).join('；')}</p><h3>分歧</h3><p>${(v.disagreements||[]).map(escapeHtml).join('；')}</p><h3>候选选题线索</h3>${v.gaps?.length?v.gaps.map(g=>`<section><h4>${escapeHtml(g.question)}</h4><p>判断类型：${escapeHtml(g.classification)} · 补查：${escapeHtml(g.searchStatus)}</p><p>依据：${(g.basis||[]).map(e=>`<a href="${safeUrl(e.url)}">${escapeHtml(e.doi||e.locator)}</a>`).join('、')}</p><p>替代解释：${escapeHtml(g.alternativeExplanation)}</p><p>下一步验证：${escapeHtml(g.nextValidation)}</p><p>${escapeHtml(g.boundary)}</p>${(g.comparisons||[]).map(c=>`<p>${escapeHtml(c.text)} <a href="${safeUrl(c.url)}">对照依据：${escapeHtml(c.locator)}</a></p>`).join('')}${(g.comparators||[]).map(c=>`<p><a href="${safeUrl(c.url)}">${escapeHtml(c.title)}</a></p>`).join('')}</section>`).join(''):'<p>候选空白分析未完成，不据此宣称无人研究。</p>'}</section>`;}
function synthesisMarkdown(v){return v?`## 月度综合\n状态：${v.status}\n主题：${(v.themes||[]).join('；')}\n分歧：${(v.disagreements||[]).join('；')}\n${(v.gaps||[]).map(g=>`### ${g.question}\n类型：${g.classification}；补查：${g.searchStatus}\n依据：${(g.basis||[]).map(e=>e.url).join(' ')}\n替代解释：${g.alternativeExplanation}\n下一步：${g.nextValidation}\n${g.boundary}\n对照：${(g.comparators||[]).map(c=>`[${c.title}](${c.url})`).join(' ')}`).join('\n')}`:'';}
function coverageHtml(cs){if(!cs?.length)return '';return `<details><summary>检索覆盖：${cs.filter(c=>c.complete).length}/${cs.length} 本期刊完整</summary>${cs.map(c=>`<p>${escapeHtml(c.name)}：${c.retrievedCount||0} 条 · ${c.complete?'完整':c.error?'获取失败/部分失败':'达到页数上限'} ${escapeHtml(c.error||'')}</p>`).join('')}</details>`;}
function monthSelector(r){return `<label class="month-selector">切换月份 <select id="monthSelector">${state.index.monthly.map(e=>`<option value="${escapeHtml(e.reportId)}" ${e.reportId===r.reportId?'selected':''}>${escapeHtml(e.reportId)} ${e.status==='archived'?'归档':'暂定'}</option>`).join('')}</select></label>`;}
function feedbackHtml(p){const v=feedback.items[p.doi];return `<div class="feedback" data-feedback-doi="${escapeHtml(p.doi)}"><p>阅读反馈（仅保存在当前浏览器）</p><button type="button" data-feedback="worth-reading" aria-pressed="${v?.value==='worth-reading'}">值得读</button><button type="button" data-feedback="irrelevant" aria-pressed="${v?.value==='irrelevant'}">不相关</button><button type="button" data-feedback="clear">清除</button><label>可选原因 <input type="text" maxlength="300" data-feedback-reason value="${escapeHtml(v?.reason||'')}" placeholder="选题相关性、方法或其他原因"></label></div>`;}
content.addEventListener('change',e=>{if(e.target.id==='monthSelector'){location.hash='#/monthly/'+encodeURIComponent(e.target.value);return;}const box=e.target.closest('[data-feedback-doi]');if(box&&e.target.matches('[data-feedback-reason]')){const doi=box.dataset.feedbackDoi,v=feedback.items[doi];if(v){const next=structuredClone(feedback);next.items[doi]={...v,reason:e.target.value,updatedAt:new Date().toISOString()};persistFeedback(next);}}});
content.addEventListener('click',e=>{const button=e.target.closest('[data-feedback]'),box=button?.closest('[data-feedback-doi]');if(!box)return;const doi=box.dataset.feedbackDoi,next=structuredClone(feedback);if(button.dataset.feedback==='clear')delete next.items[doi];else next.items[doi]={doi,value:button.dataset.feedback,reason:box.querySelector('[data-feedback-reason]').value,updatedAt:new Date().toISOString()};if(persistFeedback(next))box.outerHTML=feedbackHtml({doi});});
document.querySelector('#exportFeedback').addEventListener('click',()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(feedback,null,2)],{type:'application/json'}));a.href=url;a.download='ecology-feedback.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
document.querySelector('#importFeedback').addEventListener('change',async e=>{try{const f=e.target.files?.[0];if(!f)return;if(f.size>1_000_000)throw Error('反馈文件超过1MB');const next=mergeFeedback(feedback,importFeedback(await f.text()));if(persistFeedback(next)){if(state.report)renderReport(state.report);alert('反馈导入完成。');}}catch(error){alert(error.message);}finally{e.target.value='';}});

function evidenceLinks(p,key){return (p.essence?.evidence?.[key]||[]).map(e=>`<a class="evidence-link" href="${safeUrl(e.url)}" target="_blank" rel="noopener noreferrer">原文依据：${escapeHtml(e.locator)}</a>`).join(' ');}
