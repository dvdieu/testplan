export const DAY = 86400000;

// Parse 'YYYY-MM-DD' to a UTC-noon timestamp (timezone-safe day math).
export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d, 12);
}

export function todayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysStr(s, n) {
  const t = parseDate(s);
  if (t === null) return null;
  const dt = new Date(t + n * DAY);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Days from a to b (b - a).
export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / DAY);
}

// ---------- working-day (WKD) helpers ----------

function getUtcDay(s) {
  const t = parseDate(s);
  return t === null ? null : new Date(t).getUTCDay();
}

export function isWeekend(s) {
  const d = getUtcDay(s);
  return d === 0 || d === 6;
}

// Next working day on or after s (skips Sat/Sun).
export function nextWkd(s) {
  let cur = s;
  while (isWeekend(cur)) {
    cur = addDaysStr(cur, 1);
  }
  return cur;
}

// Add n working days to s. Weekends are skipped, never counted.
export function addWkdStr(s, n) {
  let cur = nextWkd(s);
  for (let i = 0; i < n; i++) {
    cur = addDaysStr(cur, 1);
    cur = nextWkd(cur);
  }
  return cur;
}

// Working days from a to b (b - a), skipping weekends. Always >= 0.
export function diffWkd(a, b) {
  let start = nextWkd(a);
  const end = parseDate(b);
  if (end === null || parseDate(start) === null || parseDate(start) >= end) return 0;
  let count = 0;
  while (parseDate(start) < end) {
    count++;
    start = addDaysStr(start, 1);
    start = nextWkd(start);
  }
  return count;
}

export function fmtShort(s) {
  if (!s) return '—';
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
}

export function fmtFull(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export function maxDate(...list) {
  const valid = list.filter(Boolean);
  if (!valid.length) return null;
  return valid.reduce((a, b) => (parseDate(b) > parseDate(a) ? b : a));
}

export function minDate(...list) {
  const valid = list.filter(Boolean);
  if (!valid.length) return null;
  return valid.reduce((a, b) => (parseDate(b) < parseDate(a) ? b : a));
}
