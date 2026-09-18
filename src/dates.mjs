const DAY_MS = 86_400_000;

export function assertDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new Error(`无效日期：${value}`);
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) throw new Error(`无效日期：${value}`);
  return value;
}

export function todayInShanghai(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

export function shiftDate(dateKey, days) {
  assertDateKey(dateKey);
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dateRange(from, to) {
  assertDateKey(from);
  assertDateKey(to);
  const values = [];
  for (let current = from; current <= to; current = shiftDate(current, 1)) values.push(current);
  return values;
}

export function recentRange(dateKey, days = 30) {
  assertDateKey(dateKey);
  if (!Number.isInteger(days) || days < 1) throw new Error('days 必须是正整数');
  return { from: shiftDate(dateKey, -(days - 1)), to: dateKey };
}

function isoParts(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / DAY_MS) + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

export function isoWeekKey(dateKey) {
  const { year, week } = isoParts(dateKey);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function weekStart(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function previousNaturalWeek(dateKey) {
  assertDateKey(dateKey);
  const currentMonday = weekStart(dateKey);
  const from = shiftDate(currentMonday, -7);
  return { from, to: shiftDate(currentMonday, -1) };
}

export function isMonday(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay() === 1;
}

export function dateLabel(dateKey) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  }).format(new Date(`${dateKey}T12:00:00+08:00`));
}
