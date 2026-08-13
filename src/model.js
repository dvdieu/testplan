// Lõi nghiệp vụ (thuần, không React, không IO). Toàn bộ toán lịch + phán quyết ở đây;
// PlannerPage chỉ dựng UI và gọi các hàm này. Ngày suy từ KickOff theo chuỗi WKD.
import { addWkdStr, diffWkd, maxDate, nextWkd, parseDate, setHolidays, todayStr } from './date.js';

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
  if (plan.template === 'wbs') return computeWbs(plan); // WBS: bộ lịch riêng (Sum tuần tự…)
  const oos = plan.oos || { signoff: false, ready: false, done: false };
  setHolidays(plan.holidays); // ngày nghỉ ảnh hưởng toàn bộ phép tính WKD bên dưới
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

// ---------- WBS (Work Breakdown Structure) ----------
// Cấu trúc mẫu: Sum (nhóm) → Task (việc) → '+' (việc con). Lịch (theo lựa chọn user):
//   • Sum chạy TUẦN TỰ  — Sum sau bắt đầu khi Sum trước kết thúc.
//   • Task trong 1 Sum chạy SONG SONG — cùng bắt đầu tại đầu Sum.
//   • Việc con SONG SONG trong Task — cùng bắt đầu tại đầu Task.
//   • Lá mang WKD; node có con thì BAO (span) theo ngày kết thúc muộn nhất của con.
//   • Sum "Package" = đóng gói → ngày hoàn thành dự án, đem so với deadline Studio.
export function wbsTemplate() {
  return [
    { name: 'Decomposition', children: [
      { name: 'Docs API GameEngine', wkd: 3 },
      { name: 'Docs Game History, TopWin, LeaderBoard', wkd: 3 },
      { name: 'BackOffice', children: [
        { name: 'BO Report', wkd: 2 },
        { name: 'History Details', wkd: 2 },
      ] },
    ] },
    { name: 'Faking until to making', children: [
      { name: 'API GameEngine Ready Mock', children: [
        { name: 'Devops GameEngine', wkd: 4 },
      ] },
      { name: 'API Game History Bet, TopWin, LeaderBoard Ready Mock', children: [
        { name: 'Devops Platform', wkd: 4 },
      ] },
    ] },
    { name: 'Development-Game', children: [
      { name: 'GameEngine Development', children: [
        { name: 'Functional', wkd: 8 },
        { name: 'Tool cheat', wkd: 4 },
      ] },
    ] },
    { name: 'Integration-QC', children: [
      { name: 'Support Integration', wkd: 5 },
    ] },
    { name: 'Package', wkd: 0 }, // đóng gói = MỐC hoàn thành dự án (so với deadline Studio); không có việc con
  ];
}

// Cây template → mảng rows phẳng { id, parentId?, name, wkd? }. Lá có wkd; nhóm không.
function flattenWbs(nodes, parentId, out) {
  nodes.forEach(n => {
    const id = crypto.randomUUID();
    const row = { id, name: n.name };
    if (parentId) row.parentId = parentId;
    if (n.children && n.children.length) {
      out.push(row);
      flattenWbs(n.children, id, out);
    } else {
      row.wkd = num(n.wkd);
      out.push(row);
    }
  });
  return out;
}

// Suy start/end mỗi row của cây WBS. Trả bản sao rows kèm { start, end, wkdEff }.
// wkdEff = WKD lá (user nhập) hoặc span của nhóm (để hiển thị trong lưới).
export function resolveWbs(plan) {
  setHolidays(plan.holidays); // ngày nghỉ ảnh hưởng mọi phép cộng WKD bên dưới
  const rows = (plan.rows || []).map(r => ({ ...r }));
  const kids = pid => rows.filter(r => (r.parentId || null) === pid);
  function schedule(node, start) {
    node.start = start || null;
    const cs = kids(node.id);
    if (!cs.length) {
      node.end = start ? addWkdStr(start, num(node.wkd)) : null;
      node.wkdEff = num(node.wkd);
    } else {
      let end = start; // con SONG SONG: mọi con bắt đầu tại node.start, node bao tới con muộn nhất
      cs.forEach(c => {
        const e = schedule(c, start);
        if (e && (!end || parseDate(e) > parseDate(end))) end = e;
      });
      node.end = end || start || null;
      node.wkdEff = start && node.end ? diffWkd(start, node.end) : 0;
    }
    return node.end;
  }
  let cursor = plan.startDate ? nextWkd(plan.startDate) : null; // KickOff (dời tới ngày làm việc)
  kids(null).forEach(sum => { schedule(sum, cursor); cursor = sum.end || cursor; }); // Sum tuần tự
  return rows;
}

// Phán quyết cho plan WBS: projectDone = ngày muộn nhất (đuôi "Package") so deadline Studio.
function computeWbs(plan) {
  const rows = resolveWbs(plan);
  const projectDone = maxDate(...rows.map(r => r.end).filter(Boolean));
  let doneSlack = null;
  if (projectDone && plan.studioDeadline) {
    doneSlack = parseDate(projectDone) <= parseDate(plan.studioDeadline)
      ? diffWkd(projectDone, plan.studioDeadline)   // xong trước deadline → slack dương
      : -diffWkd(plan.studioDeadline, projectDone);  // trễ → slack âm
  }
  return {
    rows,
    wbs: true,
    feContract: null,
    feReady: null,
    projectDone,
    effApiDoc: null,
    effReady: null,
    apiSlack: null,
    readySlack: null,
    doneSlack,
    canJudge: doneSlack != null,
    accepted: doneSlack != null && doneSlack >= 0,
  };
}

// ---------- factory + migrations ----------

export function defaultPlan(projectName, phase) {
  const today = todayStr();
  return {
    projectName,
    phase,
    gameName: projectName,
    startDate: today,
    studioDeadline: addWkdStr(today, 30),
    pic: '',
    noe: false,
    jp: false,
    cert: false,
    milestones: defaultMilestones(today),
    oos: { signoff: false, ready: false, done: false },
    holidays: [], // ngày nghỉ tuỳ chỉnh (YYYY-MM-DD) — coi như ngày không làm việc
    lengthUnit: 'day', // đơn vị làm tròn độ dài bar trên Gantt (hour|day|week)
    template: 'wbs', // seed mặc định = cây WBS (Sum→Task→việc con). Plan cũ đã lưu KHÔNG có cờ này → giữ mô hình 3-phase.
    rows: flattenWbs(wbsTemplate(), null, []),
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
  // Loại plan lấy THEO remote: plan cũ đã lưu (không có 'template') → undefined → giữ mô hình 3-phase.
  // (defaultPlan gán template:'wbs' qua spread, phải ghi đè lại để không ép WBS lên dữ liệu cũ.)
  base.template = remote.template;
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
  if (base.template === 'wbs') return base; // rows WBS (wkd + cây) — không chạy migrate 3-phase
  return migrateRows(base);
}
