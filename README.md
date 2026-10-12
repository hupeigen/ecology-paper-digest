# 生态论文雷达：日报、周报与月度精选

面向生态学研究生阅读的静态论文雷达。系统从 Crossref 获取近 30 天论文，并通过 OpenAlex、DOAJ、Unpaywall 和公开论文页面补充摘要与开放全文信息。GitHub Actions 每个北京时间早上自动更新，GitHub Pages 提供手机和电脑共用的响应式网页。

## 功能

- 日报推荐 4–5 篇，周报从上一自然周独立重评并推荐 8 篇。
- 保留原16本期刊并增加Nature、Science、Nature Communications、Science Advances、PNAS、Nature Geoscience、Nature Microbiology；三类报告始终检索完整23刊池，综合期刊先过滤生态相关论文。
- 新报告采用 ecology-topic-v1：课题相关性35%、实验与分析可迁移性30%、问题拆解20%、前沿与候选空白15%，逐项附理由。旧报告保留其原始五维评分。
- 每篇包含推荐理由、关键词、DOI/开放全文链接、评分，以及问题、设计、创新、可借鉴思路与局限。
- 没有可靠摘要时明确标注，不根据标题编造实验设计。
- 所有历史日报和周报永久保留，支持搜索、筛选、打印和 Markdown 复制。
- 零第三方运行依赖；无 LLM 密钥时可完整运行规则模式。

## 本地使用

需要 Node.js 20 或更高版本。

```powershell
node --test
node scripts/update.mjs --kind=auto
node scripts/build-site.mjs
node scripts/serve.mjs
```

浏览器打开 `http://127.0.0.1:4174`。局域网访问可运行：

```powershell
node scripts/serve.mjs --lan
```

使用固定样本进行不联网测试：

```powershell
node scripts/update.mjs --date=2026-09-18 --kind=both --fixture=test/fixtures/papers.json --no-enrichment --no-llm --dry-run
```

## LLM 配置

系统支持 OpenAI 兼容的 `/chat/completions` 接口。全部变量均为可选：

```powershell
$env:LLM_BASE_URL = 'https://api.example.com/v1'
$env:LLM_API_KEY = 'your-key'
$env:LLM_MODEL = 'your-model'
$env:CROSSREF_MAILTO = 'you@example.com'
$env:CONTACT_EMAIL = 'you@example.com'
```

- `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` 用于规则评分的可选增强与结构化总结。
- `CROSSREF_MAILTO` 用于 Crossref polite pool，建议填写真实联系邮箱。
- `CONTACT_EMAIL` 用于 Unpaywall；未配置时跳过 Unpaywall。
- 每次日报或周报最多向模型发送 12 篇高分候选，摘要截断至约 1400 字符。
- 模型失败、限流、超时或 JSON 不合格时自动回退到规则摘要。

## GitHub Pages

1. 创建公开仓库 `ecology-paper-digest` 并推送本项目。
2. 在仓库 `Settings → Pages → Source` 选择 `GitHub Actions`。
3. 在 `Settings → Secrets and variables → Actions` 按需添加 LLM 和邮箱变量。
4. 手动运行一次 `Update ecology reports` 工作流，完成首次报告与部署。
5. 网站地址通常为 `https://<用户名>.github.io/ecology-paper-digest/`。

更新工作流在北京时间每天 08:10 运行；如果当天是周一，会同时生成上一自然周周报。也可以在 Actions 页面手动选择 `daily`、`weekly` 或 `both` 补跑。

## 文件结构

- `config/journals.json`：核心与扩展期刊、ISSN。
- `config/topics.json`：五维权重、导师方向词和主题标签。
- `src/`：Crossref 获取、摘要补充、评分、选择、LLM 总结和报告存储。
- `web/`：无框架的响应式静态站点。
- `data/reports/`：永久保存的日报、周报和索引。
- `.github/workflows/`：自动更新与 GitHub Pages 部署。

## 数据与版权

网页只发布题录、结构化中文总结、评分和原文链接，不发布完整受版权保护的摘要或全文。系统不会绕过登录、付费墙或其他访问限制；无法取得摘要时只提供可靠题录并提示需要阅读全文。

## 测试

```powershell
node --test
node --check scripts/update.mjs
node --check scripts/build-site.mjs
node --check web/app.js
```

测试覆盖期刊配置、Crossref 解析、日期窗口、评分、每日/每周选择、摘要可靠降级、历史去重和离线端到端报告生成。

## 一键发布脚本

如果设备登录可用，在项目目录运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\publish.ps1
```

脚本会读取 `gh` 登录状态，配置 Git 身份，创建公开仓库 `ecology-paper-digest`，推送 `main`，启用 GitHub Actions Pages，并手动启动第一次报告更新。

如果 `github.com` 设备登录超时，但 `api.github.com` 可访问，可以先准备一个具有 `repo` 和工作流权限的临时 GitHub token，然后运行：

```powershell
$secure = Read-Host -AsSecureString
$env:GH_TOKEN = [System.Net.NetworkCredential]::new('', $secure).Password
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\publish.ps1
```

完成后请撤销临时 token。


### github.com 直连不可用时

项目提供纯 `api.github.com` 发布器。先准备一个仅用于本次发布的经典 PAT，建议只勾选 `repo` 和 `workflow` 权限，然后运行：

```powershell
$secure = Read-Host -AsSecureString
$env:GH_TOKEN = [System.Net.NetworkCredential]::new('', $secure).Password
node .\scripts\publish-api.mjs
Remove-Item Env:GH_TOKEN
```

该脚本通过 GitHub Git Data API 上传已提交文件，创建 `ecology-paper-digest` 仓库，启用 Actions Pages 并启动首次报告任务。完成后请立即撤销临时 PAT。

## 月度精选与选题启发（2026-10-12）

主线：亚热带森林干旱、凋落物/倒木分解及土壤碳，兼顾植物—微生物—土壤联动。根系分泌物与根代谢物中心研究降低课题优先级，作为机制参考。期刊名气不加分；设备、经费、场地及周期均待核实。

月报按北京时间自然月编号 YYYY-MM，每周一更新本月暂定精选，1日归档上月；两者重合分别生成两个月份。首次 auto 会补建本月至当日月报。月报独立检索与选篇，不受日报历史去重影响。目标10篇，主线约8篇、启发最多2篇，单刊最多3篇、综述最多2篇；不足少选。当前月为 provisional，往月为 archived，归档重跑必须显式 --revise，保存原版及修订时间。

```powershell
node scripts/update.mjs --kind=monthly --month=2026-10
node scripts/update.mjs --kind=monthly --month=2026-09 --revise
node scripts/update.mjs --kind=monthly --month=2026-09 --date=2026-10-12 --fixture=test/fixtures/papers.json --no-enrichment --no-llm --dry-run --preview-output=data/tmp/offline-monthly.json
```

模型配置继续使用原有三个 LLM 环境变量及 Actions secrets。单次命令共享限额：16篇唯一摘要候选、5篇深读、3条候选线索、含重试12次模型请求；全文输入保守截断至8000字符（一般低于约8000 tokens）。题录、摘要、内容、标准版本、模型和分析阶段参与私有缓存键。缓存 data/cache 不提交、不复制到站点，Actions 可复用缓存。

公开全文优先采用Europe PMC OA JATS及合法开放的出版方HTML；仅PDF而无法解析、正文不足、付费或拦截页面均保持摘要级。公开补充材料优先尝试文本/HTML/XML；PDF附件当前不解析，记录缺口。全文存在不代表深读通过：各节需精确引句与定位校验，仍须人工检查语义。数值无引句支持将拒绝。

候选线索按每条最多5篇补查近五年及经典候选，并区分系统推断、摘要级文献支持与仍待验证的边界；有界检索不构成系统综述或无人研究证明。模型不可用/额度耗尽提供规则精选，明确深读和空白分析未完成。获取全部失败或空候选伴获取失败时拒绝更新、保留上一版。

浏览器反馈支持值得读、不相关、可选原因、清除与JSON导入导出。仅当前浏览器存储，不自动调权重、不自动同步。导入失败保留旧记录；更新标准须明确校准。

验收见 ACCEPTANCE.md。当前本月预览为规则模式，人工核查4篇摘要级分析；全文深读与空白内容质量尚未验收。发布待GitHub认证。回退标签 radar-before-monthly-20261012。
