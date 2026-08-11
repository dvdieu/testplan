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
