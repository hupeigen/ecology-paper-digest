# 生态学高价值论文日报与周报

面向生态学研究生阅读的静态论文雷达。系统从 Crossref 获取近 30 天论文，并通过 OpenAlex、DOAJ、Unpaywall 和公开论文页面补充摘要与开放全文信息。GitHub Actions 每个北京时间早上自动更新，GitHub Pages 提供手机和电脑共用的响应式网页。

## 功能

- 日报推荐 4–5 篇，周报从上一自然周独立重评并推荐 8 篇。
- 核心期刊固定为 8 本，候选不足时使用 8 本生态与全球变化扩展期刊。
- 评分维度：导师/碳循环 30%、国家战略 20%、应用价值 20%、跨学科 15%、前沿突破 15%。
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
