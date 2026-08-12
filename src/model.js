// Lõi nghiệp vụ (thuần, không React, không IO). Toàn bộ toán lịch + phán quyết ở đây;
// PlannerPage chỉ dựng UI và gọi các hàm này. Ngày suy từ KickOff theo chuỗi WKD.
import { addWkdStr, diffWkd, maxDate, todayStr } from './date.js';

export const num = v => Math.max(0, Math.round(Number(v) || 0));

// Mốc Studio động: mỗi mốc = Loại (type) · Status · Ngày mong muốn.
// Loại (type): tự do, có gợi ý. Status: combobox cố định 4 giá trị dưới.
export const MS_TYPES = ['API-CONTRACT', 'BE-GAME', 'Deploy BE', 'Tool-Cheat Game', 'Tool-Cheat Ví'];
export const MS_STATUSES = [
  { value: 'SignOff', label: 'SignOff · Đã chốt' },
  { value: 'Smoke test', label: 'Smoke test' },
  { value: 'READY', label: 'READY' },
  { value: 'DONE', label: 'DONE' },
];
const MS_STATUS_VALUES = new Set(MS_STATUSES.map(s => s.value));
// Map status cũ (R4*) → enum mới khi nạp plan cũ
const LEGACY_STATUS = {
  R4Implementation: 'SignOff',
  R4Network: 'Smoke test',
  R4Integration: 'READY',
  R4QC: 'DONE',
  R4RTPPair: 'DONE',
};
const normStatus = s => (MS_STATUS_VALUES.has(s) ? s : LEGACY_STATUS[s] || 'READY');

// Bộ mốc Studio mặc định. API-CONTRACT = hard: luôn có, Loại khoá, không xoá (chỉ sửa Status/Ngày).
const defaultMilestones = today => [
  { id: crypto.randomUUID(), type: 'API-CONTRACT', status: 'SignOff', date: addWkdStr(today, 7), hard: true },
  { id: crypto.randomUUID(), type: 'BE-GAME', status: 'Smoke test', date: addWkdStr(today, 12) },
  { id: crypto.randomUUID(), type: 'BE-GAME', status: 'READY', date: addWkdStr(today, 16) },
  { id: crypto.randomUUID(), type: 'BE-GAME', status: 'DONE', date: addWkdStr(today, 26) },
];

// Phase Backend ↔ mốc Studio. Ưu tiên mốc đã ghim (plan.phaseMs), nếu chưa thì suy theo status/type.
const PHASE_MS_RE = {
  contract: /signoff|contract|^api/i,
  dev: /ready|integration/i,
  done: /^done$|deploy|rtp/i,
};
export function resolvePhaseMs(plan, key) {
  const list = plan.milestones || [];
  const pinnedId = plan.phaseMs && plan.phaseMs[key];
  const pinned = pinnedId && list.find(m => m.id === pinnedId);
  return (
    pinned ||
    list.find(m => PHASE_MS_RE[key].test(m.status || '') || PHASE_MS_RE[key].test(m.type || '')) ||
    null
  );
}

// Bảng chỉ nhập số ngày làm việc (WKD); mọi ngày suy ra từ KickOff theo chuỗi:
//   SignOff API  = KickOff + contractDays
//   Ready Integ. = MAX(SignOff API mọi team) + readyDays
//   Dev Done     = Ready Integration + doneDays
export function resolveRows(plan) {
  const { startDate } = plan;
  const withContract = plan.rows.map(r => ({
    ...r,
    contract: startDate ? addWkdStr(startDate, num(r.contractDays)) : null,
  }));
  const signOff = maxDate(...withContract.map(r => r.contract));
  return withContract.map(r => {
    const ready = signOff ? addWkdStr(signOff, num(r.readyDays)) : null;
    return { ...r, ready, done: ready ? addWkdStr(ready, num(r.doneDays)) : null };
  });
}

// Toàn bộ ngày & phán quyết Backend cho một plan. View chỉ đọc kết quả.
export function computeBackend(plan) {
  const oos = plan.oos || { signoff: false, ready: false, done: false };
  const rows = resolveRows(plan);
  const feContract = maxDate(...rows.map(r => r.contract));
  const feReady = maxDate(...rows.map(r => r.ready));
  const projectDone = maxDate(...rows.map(r => r.done));

  const effApiDoc = resolvePhaseMs(plan, 'contract')?.date;
  const effReady = resolvePhaseMs(plan, 'dev')?.date;

  const apiSlack = !oos.signoff && feContract && effApiDoc ? diffWkd(feContract, effApiDoc) : null;
  const readySlack = !oos.ready && feReady && effReady ? diffWkd(feReady, effReady) : null;
  const doneSlack =
    !oos.done && projectDone && plan.studioDeadline ? diffWkd(projectDone, plan.studioDeadline) : null;

  const canJudge =
    (oos.signoff || apiSlack !== null) &&
    (oos.ready || readySlack !== null) &&
    (oos.done || doneSlack !== null);
  const accepted =
    canJudge &&
    (oos.signoff || apiSlack >= 0) &&
    (oos.ready || readySlack >= 0) &&
    (oos.done || doneSlack >= 0);

  return {
    rows,
    feContract,
    feReady,
    projectDone,
    effApiDoc,
    effReady,
    apiSlack,
    readySlack,
    doneSlack,
    canJudge,
    accepted,
  };
}

// ---------- factory + migrations ----------

export function defaultPlan(projectName, phase) {
  const today = todayStr();
  const mk = (name, contractDays, readyDays, doneDays) => ({
    id: crypto.randomUUID(),
    name,
    contractDays,
    readyDays,
    doneDays,
  });
  return {
    projectName,
    phase,
    gameName: projectName,
    startDate: today,
    studioDeadline: addWkdStr(today, 30),
    pic: '',
    noe: false,
    milestones: defaultMilestones(today),
    oos: { signoff: false, ready: false, done: false },
    rows: [
      mk('Team Infra', 3, 2, 10),
      mk('Team BO', 5, 5, 12),
      mk('Team Platform', 6, 7, 14),
      mk('Team BE', 4, 3, 12),
    ],
  };
}

function migrateOos(saved) {
  if (saved.oos && typeof saved.oos === 'object') return saved.oos;
  return { signoff: false, ready: false, done: saved.doneOutOfScope === true };
}

// Plan cũ lưu ngày trực tiếp (contract/ready/done) → chuyển sang số ngày WKD (contractDays…).
function migrateRows(plan) {
  if (
    plan.rows.every(
      r => r.contractDays !== undefined && r.readyDays !== undefined && r.doneDays !== undefined,
    )
  )
    return plan;
  const { startDate } = plan;
  const withDays = plan.rows.map(r => ({
    ...r,
    contractDays: r.contractDays ?? (startDate && r.contract ? num(diffWkd(startDate, r.contract)) : 0),
  }));
  const signOff = startDate
    ? maxDate(...withDays.map(r => addWkdStr(startDate, r.contractDays)))
    : null;
  const rows = withDays.map(row => {
    const { contract, ready, done, ...rest } = row;
    const readyDays = rest.readyDays ?? (signOff && ready ? num(diffWkd(signOff, ready)) : 0);
    const readyDate = signOff ? addWkdStr(signOff, readyDays) : null;
    const doneDays = rest.doneDays ?? (readyDate && done ? num(diffWkd(readyDate, done)) : 0);
    return { ...rest, readyDays, doneDays };
  });
  return { ...plan, noe: plan.noe ?? false, rows };
}

// Chuẩn hoá một plan đã nạp từ storage về schema hiện tại (mốc động, status enum, hard-code…).
export function hydratePlan(remote, projectName, phase) {
  if (!remote) return defaultPlan(projectName, phase);
  const base = { ...defaultPlan(projectName, phase), ...remote, oos: migrateOos(remote) };
  delete base.doneOutOfScope;
  if (!Array.isArray(base.milestones) || base.milestones.length === 0) {
    base.milestones = defaultMilestones(base.startDate || todayStr());
  }
  base.milestones = base.milestones.map(m => ({ ...m, status: normStatus(m.status) }));
  // Nâng cấp mốc API-CONTRACT sẵn có → hard. Không tự thêm lại nếu user đã xoá.
  if (!base.milestones.some(m => m.hard)) {
    const idx = base.milestones.findIndex(m => m.type === 'API-CONTRACT');
    if (idx >= 0) base.milestones = base.milestones.map((m, i) => (i === idx ? { ...m, hard: true } : m));
  }
  return migrateRows(base);
}
