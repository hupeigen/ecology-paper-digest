const DEFAULT_TIMEOUT_MS = 20_000;
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HttpError extends Error {
  constructor(message, status, url) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

export async function request(url, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 2,
    headers = {},
    ...fetchOptions
  } = options;
  if (typeof fetchImpl !== 'function') throw new Error('当前 Node 环境不支持 fetch');

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...fetchOptions,
        headers: {
          'user-agent': 'EcologyPaperDigest/1.0 (+https://github.com/)',
          accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
          ...headers
        },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        if (RETRYABLE.has(response.status) && attempt < retries) {
          const retryAfter = Number(response.headers.get('retry-after'));
          await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10_000) : 500 * 2 ** attempt);
          continue;
        }
        throw new HttpError(`HTTP ${response.status} ${response.statusText}`.trim(), response.status, url);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (error instanceof HttpError && !RETRYABLE.has(error.status)) throw error;
      if (attempt < retries) await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError || new Error(`请求失败：${url}`);
}

export async function requestJson(url, options = {}) {
  const response = await request(url, options);
  return response.json();
}

export async function readLimitedText(response, maxBytes = 1_500_000) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`响应过大：${declared} bytes`);
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('响应超过文本大小限制');
  return text;
}
