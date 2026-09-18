const NAMED_ENTITIES = new Map([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"],
  ['nbsp', ' '], ['ndash', '–'], ['mdash', '—'], ['hellip', '…'],
  ['rsquo', '’'], ['lsquo', '‘'], ['rdquo', '”'], ['ldquo', '“']
]);

export function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES.get(name.toLowerCase()) ?? match);
}

export function stripHtml(value) {
  return decodeHtml(String(value ?? '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanTitle(value) {
  return stripHtml(Array.isArray(value) ? value[0] : value).replace(/\s+([,.;:!?])/g, '$1');
}

export function normalizeDoi(value) {
  return String(value ?? '')
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .toLowerCase();
}

export function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const clean = String(value ?? '').trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

export function truncate(value, length) {
  const text = String(value ?? '').trim();
  return text.length <= length ? text : `${text.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
}

export function splitSentences(value) {
  const text = stripHtml(value).replace(/\s+/g, ' ').trim();
  if (!text) return [];
  return text.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
}

export function firstSentences(value, count = 2, maxLength = 500) {
  return truncate(splitSentences(value).slice(0, count).join(' '), maxLength);
}

export function findSentence(value, terms) {
  const sentences = splitSentences(value);
  return sentences.find((sentence) => terms.some((term) => sentence.toLowerCase().includes(term.toLowerCase()))) || '';
}

export function escapeMarkdown(value) {
  return String(value ?? '').replace(/([\\`*_{}[\]()#+.!|>-])/g, '\\$1');
}
