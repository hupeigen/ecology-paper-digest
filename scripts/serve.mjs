import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/config.mjs';

const DIST_DIR = path.join(ROOT, 'dist');
const host = process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
const port = Number(process.env.PORT || 4174);
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml'
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const target = path.resolve(DIST_DIR, relative);
    if (target !== DIST_DIR && !target.startsWith(`${DIST_DIR}${path.sep}`)) throw new Error('路径无效');
    let filePath = target;
    if ((await stat(filePath)).isDirectory()) filePath = path.join(filePath, 'index.html');
    const content = await readFile(filePath);
    res.writeHead(200, { 'content-type': types[path.extname(filePath)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('页面不存在');
  }
}).listen(port, host, () => {
  console.log(`本地预览：http://${host}:${port}`);
});
