import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.github.com';
const token = String(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim();
const repoName = String(process.env.REPO_NAME || 'ecology-paper-digest').trim();
if (!token) throw new Error('缺少 GH_TOKEN。请先设置临时 GitHub token。');

async function api(pathname, options = {}) {
  const response = await fetch(`${API}${pathname}`, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'ecology-paper-digest-publisher',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(45_000)
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const error = new Error(`${options.method || 'GET'} ${pathname} 失败：HTTP ${response.status} ${typeof body === 'string' ? body : body?.message || ''}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function tryApi(pathname, options = {}) {
  try { return await api(pathname, options); } catch (error) { return { __error: error }; }
}

const user = await api('/user');
const owner = user.login;
const repoPath = `/repos/${owner}/${repoName}`;
let repository = await tryApi(repoPath);
if (repository.__error?.status === 404) {
  repository = await api('/user/repos', {
    method: 'POST',
    body: JSON.stringify({ name: repoName, private: false, auto_init: false, description: '生态学高价值论文日报与周报' })
  });
} else if (repository.__error) {
  throw repository.__error;
}

const branch = 'main';
let ref = await tryApi(`${repoPath}/git/ref/heads/${branch}`);
let refMissing = Boolean(ref.__error && [404, 409].includes(ref.__error.status));
if (ref.__error && !refMissing) throw ref.__error;
if (refMissing) {
  await api(`${repoPath}/contents/.bootstrap`, {
    method: 'PUT',
    body: JSON.stringify({ message: 'chore: initialize repository', content: Buffer.from('# bootstrap\n').toString('base64'), branch })
  });
  ref = await api(`${repoPath}/git/ref/heads/${branch}`);
  refMissing = false;
}
const parent = ref.object.sha;
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT })
  .toString('utf8').split('\0').filter(Boolean);
if (tracked.length === 0) throw new Error('Git 仓库没有已跟踪文件，请先提交项目。');

const tree = [];
for (const file of tracked) {
  const content = await readFile(path.join(ROOT, file));
  const blob = await api(`${repoPath}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' })
  });
  tree.push({ path: file.replaceAll('\\', '/'), mode: '100644', type: 'blob', sha: blob.sha });
}

const newTree = await api(`${repoPath}/git/trees`, {
  method: 'POST',
  body: JSON.stringify({ tree })
});
const commit = await api(`${repoPath}/git/commits`, {
  method: 'POST',
  body: JSON.stringify({
    message: parent ? 'chore: update ecology paper digest' : 'feat: build ecology paper daily and weekly digest',
    tree: newTree.sha,
    parents: parent ? [parent] : []
  })
});
if (refMissing) {
  await api(`${repoPath}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha })
  });
} else {
  await api(`${repoPath}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false })
  });
}

let pages = await tryApi(`${repoPath}/pages`, {
  method: 'POST',
  body: JSON.stringify({ build_type: 'workflow' })
});
if (pages.__error?.status === 409) pages = await api(`${repoPath}/pages`);
else if (pages.__error) throw pages.__error;

await api(`${repoPath}/actions/workflows/update-reports.yml/dispatches`, {
  method: 'POST',
  body: JSON.stringify({ ref: branch })
});

console.log(JSON.stringify({
  repository: repository.html_url || `https://github.com/${owner}/${repoName}`,
  pages: pages.html_url || `https://${owner}.github.io/${repoName}/`,
  workflow: 'update-reports.yml started'
}, null, 2));

