const DIMENSIONS = {
  advisor: '导师方向',
  strategy: '国家战略',
  application: '应用价值',
  interdisciplinary: '跨学科',
  frontier: '前沿突破'
};
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
  state.route = { view: ['latest', 'weekly', 'archive', 'daily'].includes(view) ? view : 'latest', id: id || null };
}

function entriesFor(view) {
  if (view === 'weekly') return state.index.weekly;
  return state.index.daily;
}

function resolveEntry() {
  const { view, id } = state.route;
  if (view === 'archive') return null;
  if (view === 'weekly') return state.index.weekly.find((item) => item.reportId === id) || state.index.weekly[0] || null;
  if (view === 'daily') return state.index.daily.find((item) => item.reportId === id) || state.index.daily[0] || null;
  return state.index.daily[0] || null;
}

function activeReportKey() {
  return state.report ? `${state.report.kind}/${state.report.reportId}` : '';
}

function reportMatches(entry) {
  if (!state.query) return true;
  const haystack = [entry.title, entry.date, ...(entry.journals || []), ...(entry.keywords || [])].join(' ').toLowerCase();
  return haystack.includes(state.query.toLowerCase());
}

function renderSidebar() {
  const sections = [
    ['日报', state.index.daily],
    ['周报', state.index.weekly]
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
        <strong>${escapeHtml(entry.kind === 'weekly' ? `${entry.reportId} 周报` : formatDate(entry.date))}</strong>
        <span>${entry.paperCount} 篇 · ${escapeHtml(entry.journals?.slice(0, 2).join('、') || '期刊更新中')}</span>
      </a>`);
    }
  }
  reportList.innerHTML = html.join('') || '<div class="empty-state"><p>没有匹配的报告</p></div>';
}

function scoreHtml(valueScores, totalScore) {
  const tags = Object.entries(DIMENSIONS).map(([key, label]) => (
    `<span class="score-tag">${label} ${Number(valueScores?.[key] || 0)}</span>`
  ));
  return `<div class="score-row"><span class="score-tag total">综合 ${Number(totalScore || 0)}/100</span>${tags.join('')}</div>`;
}

function evidenceLabel(paper) {
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
    ${scoreHtml(paper.valueScores, paper.totalScore)}
    <div class="essence-grid">
      <section class="essence-block"><h3>要解决什么问题</h3><p>${escapeHtml(essence.problem)}</p></section>
      <section class="essence-block"><h3>实验或研究设计</h3><p>${escapeHtml(essence.design)}</p></section>
      <section class="essence-block"><h3>创新点</h3><p>${escapeHtml(essence.innovation)}</p></section>
      <section class="essence-block"><h3>可以借鉴的思路</h3><p>${escapeHtml(essence.transferableIdeas)}</p></section>
      <section class="essence-block wide"><h3>局限与阅读提示</h3><p>${escapeHtml(essence.limitations)}</p></section>
    </div>
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
  const period = report.kind === 'weekly' ? `${report.period.from} 至 ${report.period.to}` : report.date;
  content.innerHTML = `<header class="report-header">
    <p class="eyebrow">${report.kind === 'weekly' ? 'WEEKLY DIGEST' : 'DAILY DIGEST'}</p>
    <h1>${escapeHtml(report.kind === 'weekly' ? '生态学高价值论文周报' : '生态学高价值论文日报')}</h1>
    <p>围绕国家战略、应用价值、跨学科融合、基础前沿与伏玉玲老师课题组方向，从核心期刊和扩展期刊中筛选近期论文。</p>
    <div class="report-meta">
      <span class="meta-chip">${escapeHtml(period)}</span>
      <span class="meta-chip">${report.paperCount} 篇推荐</span>
      <span class="meta-chip">候选池 ${Number(report.diagnostics?.candidateCount || 0)} 篇</span>
      <span class="meta-chip">${report.diagnostics?.llmUsed ? 'LLM增强' : '规则模式'}</span>
      <span class="meta-chip">更新 ${formatDateTime(report.generatedAt)}</span>
    </div>
    <div class="report-actions">
      <button class="primary-button" id="copyReport" type="button">复制整期 Markdown</button>
      <button class="ghost-button" id="printReport" type="button">打印 / 存为 PDF</button>
    </div>
  </header>
  ${notice}
  <div class="paper-grid">${report.papers.map(paperCard).join('') || '<div class="empty-state"><h2>本批次暂无可推荐论文</h2><p>请查看数据说明或等待下一次更新。</p></div>'}</div>`;
}

function renderArchive() {
  const all = [...state.index.daily, ...state.index.weekly]
    .filter(reportMatches)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.generatedAt).localeCompare(String(a.generatedAt)));
  const cards = all.map((entry) => `<a class="archive-card" href="./#/${entry.kind}/${encodeURIComponent(entry.reportId)}">
    <div class="paper-type">${entry.kind === 'weekly' ? 'WEEKLY' : 'DAILY'} · ${entry.paperCount} 篇</div>
    <h2>${escapeHtml(entry.kind === 'weekly' ? `${entry.reportId} 周报` : formatDate(entry.date))}</h2>
    <p>${escapeHtml(entry.journals?.slice(0, 5).join('、') || '期刊信息更新中')}</p>
  </a>`).join('');
  content.innerHTML = `<header class="report-header">
    <p class="eyebrow">PERMANENT ARCHIVE</p>
    <h1>历史归档</h1>
    <p>所有日报和周报永久保留。可使用左侧搜索框按标题、期刊或关键词筛选。</p>
    <div class="report-meta"><span class="meta-chip">日报 ${state.index.daily.length} 期</span><span class="meta-chip">周报 ${state.index.weekly.length} 期</span></div>
  </header><div class="archive-grid">${cards || '<div class="empty-state"><h2>没有匹配报告</h2></div>'}</div>`;
}

function showEmpty(message = '') {
  content.innerHTML = `<div class="empty-state"><span>∅</span><h2>暂无报告</h2><p>${escapeHtml(message || '首次数据更新完成后，日报与周报会显示在这里。')}</p></div>`;
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
- 局限：${essence.limitations || ''}`;
}

function reportToMarkdown() {
  if (!state.report) return '';
  return `# ${state.report.selectionTitle}\n\n${state.report.papers.map(paperToMarkdown).join('\n\n')}`;
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
  if (state.route.view === 'archive') renderArchive();
});

window.addEventListener('hashchange', () => renderRoute().catch(showError));

function showError(error) {
  content.innerHTML = `<div class="empty-state"><span>!</span><h2>读取失败</h2><p>${escapeHtml(error.message)}</p></div>`;
}

async function init() {
  try {
    state.index = await fetchJson('./reports/index.json');
    const count = state.index.daily.length + state.index.weekly.length;
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
