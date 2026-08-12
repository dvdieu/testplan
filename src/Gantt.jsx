// Biểu đồ dựng trên SVAR React Gantt (@svar-ui/react-gantt) — dùng đúng như demo BasicInit:
//   <Gantt tasks links scales /> + Toolbar / ContextMenu / Editor (thêm/sửa/xoá NATIVE).
// Model của app (day-count WKD) vẫn là nguồn sự thật: seed SVAR từ backend đã tính, và ánh xạ
// mọi thao tác native (xoá/đổi tên/kéo giãn/thêm) NGƯỢC lại model qua api.intercept / api.on.
import { useMemo, useState } from 'react';
import { Gantt as SvarGantt, Willow, Toolbar, ContextMenu, Editor } from '@svar-ui/react-gantt';
import '@svar-ui/react-gantt/all.css';
import { addDaysStr, diffWkd, maxDate, minDate, parseDate, todayStr } from './date.js';
import { num } from './model.js';

const D = s => (s ? new Date(parseDate(s)) : null); // 'YYYY-MM-DD' → Date (UTC-noon, an toàn timezone)
const toStr = dt => {
  if (!dt) return null;
  const d = new Date(dt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fmtDMY = dt => { if (!dt) return ''; const d = new Date(dt); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; };

// Cột lưới: chỉ hiển thị WKD (số ngày làm việc), KHÔNG dùng Duration mặc định của SVAR (đếm ngày lịch,
// gồm cả cuối tuần). WKD sửa được inline (chỉ trên hàng phase) → ánh xạ về model qua update-task.
const COLUMNS = [
  { id: 'text', header: 'Task', flexgrow: 2 },
  { id: 'start', header: 'Bắt đầu', width: 112, align: 'center', template: v => fmtDMY(v) },
  {
    id: 'wkd',
    header: 'WKD',
    width: 76,
    align: 'center',
    editor: row => (row && row.type === 'task' ? 'text' : null),
    template: v => (v == null || v === '' ? '' : String(v)),
  },
  { id: 'add-task', width: 44 },
];

const PHASE_FIELD = { contract: 'contractDays', dev: 'readyDays', done: 'doneDays' };

// SVAR scale `format` phải là HÀM (chuỗi bị in nguyên văn — SVAR chỉ hiểu cú pháp %F/%j riêng).
// Nhận (cellStart, cellEnd) là Date → trả nhãn cột lịch.
const MONTHS = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];
const fmtMonth = d => { const x = new Date(d); return `${MONTHS[x.getMonth()]} ${x.getFullYear()}`; };
const fmtDay = d => String(new Date(d).getDate());

// Giải mã id task SVAR → thực thể trong model.
function classify(id) {
  const s = String(id);
  if (s.startsWith('grp::')) return { kind: 'group' };
  if (s.startsWith('ms::')) {
    const rest = s.slice(4);
    if (rest === 'kickoff') return { kind: 'kickoff' };
    if (rest === 'deadline') return { kind: 'deadline' };
    return { kind: 'milestone', msId: rest };
  }
  const i = s.indexOf('::');
  if (i >= 0) return { kind: 'phase', teamId: s.slice(0, i), phase: s.slice(i + 2) };
  return { kind: 'team', teamId: s };
}

// 3 phase của 1 team (giống model.resolveRows): contract | dev | done, kèm mốc from/to.
function teamPhases(r, plan, feContract, itemLabel) {
  const { startDate, oos } = plan;
  const devFrom = oos.signoff ? startDate : feContract || r.contract || startDate;
  return [
    { key: 'contract', field: 'contractDays', name: `${itemLabel} → SignOff`, from: startDate, to: r.contract, oos: oos.signoff },
    { key: 'dev', field: 'readyDays', name: 'Ready Integration', from: devFrom, to: r.ready, oos: oos.ready },
    { key: 'done', field: 'doneDays', name: 'Development Done', from: r.ready, to: r.done, oos: oos.done },
  ].filter(p => !p.oos && p.from && p.to && parseDate(p.to) > parseDate(p.from));
}

// plan + backend → { tasks, links, scales, start, end } cho SVAR.
function buildData(plan, backend, itemLabel) {
  const { startDate, studioDeadline, milestones = [] } = plan;
  const { rows, feContract } = backend;
  const tasks = [];
  const links = [];
  const dates = [startDate, studioDeadline, todayStr()];

  // Nhóm mốc Studio (tím) = KickOff + các mốc động + Deadline → các milestone (kim cương).
  tasks.push({ id: 'grp::studio', text: '🎯 Mốc Studio (mục tiêu)', type: 'summary', open: true });
  if (startDate) {
    tasks.push({ id: 'ms::kickoff', parent: 'grp::studio', text: 'KickOff', type: 'milestone', start: D(startDate) });
  }
  milestones.filter(m => m.date).forEach(m => {
    tasks.push({
      id: `ms::${m.id}`,
      parent: 'grp::studio',
      text: `${m.type} · ${m.status}${m.hard ? ' 🔒' : ''}`,
      type: 'milestone',
      start: D(m.date),
    });
    dates.push(m.date);
  });
  if (studioDeadline) {
    tasks.push({ id: 'ms::deadline', parent: 'grp::studio', text: 'Deadline Studio', type: 'milestone', start: D(studioDeadline) });
  }

  // Mỗi team = summary; 3 phase = task con + link e2s (contract → dev → done).
  rows.forEach(r => {
    tasks.push({ id: r.id, parent: r.parentId || 0, text: r.name || 'Team ?', type: 'summary', open: true });
    const phases = teamPhases(r, plan, feContract, itemLabel);
    phases.forEach(p => {
      tasks.push({
        id: `${r.id}::${p.key}`,
        parent: r.id,
        text: p.name,
        type: 'task',
        start: D(p.from),
        end: D(p.to),
        progress: 0,
        wkd: num(r[p.field]), // WKD gốc từ model (đúng số user nhập), không phải ngày lịch
      });
      dates.push(p.from, p.to);
    });
    for (let k = 1; k < phases.length; k++) {
      links.push({ id: `${r.id}:l${k}`, source: `${r.id}::${phases[k - 1].key}`, target: `${r.id}::${phases[k].key}`, type: 'e2s' });
    }
  });

  const lo = minDate(...dates.filter(Boolean));
  const hi = maxDate(...dates.filter(Boolean));
  const start = lo ? D(addDaysStr(lo, -3)) : D(todayStr());
  const end = hi ? D(addDaysStr(hi, 5)) : D(addDaysStr(todayStr(), 30));
  const scales = [
    { unit: 'month', step: 1, format: fmtMonth },
    { unit: 'day', step: 1, format: fmtDay },
  ];
  return { tasks, links, scales, start, end };
}

export default function Gantt({
  plan,
  backend,
  itemLabel = 'API',
  setRow,
  addChild,
  addTeam,
  removeTeam,
  setField,
  setMilestone,
  removeMilestone,
}) {
  const [api, setApi] = useState(null);
  const today = todayStr();

  const data = useMemo(() => buildData(plan, backend, itemLabel), [plan, backend, itemLabel]);
  // Remount SVAR khi cấu trúc/ngày đổi từ các panel khác → chart seed lại từ model.
  const sig = useMemo(() => JSON.stringify(data.tasks) + '|' + JSON.stringify(data.links), [data]);

  // init chạy mỗi lần (re)mount → closure luôn ôm props mới nhất (sig đổi ⇒ remount).
  const init = a => {
    // XOÁ: chặn default của SVAR (return false) rồi tự xoá trong model → remount phản ánh.
    a.intercept('delete-task', ({ id }) => {
      const c = classify(id);
      if (c.kind === 'group' || c.kind === 'kickoff' || c.kind === 'deadline' || c.kind === 'phase') return false;
      if (c.kind === 'milestone') {
        const m = (plan.milestones || []).find(x => x.id === c.msId);
        if (m && m.hard) return false; // mốc hard code: không xoá
        removeMilestone && removeMilestone(c.msId);
        return false;
      }
      if (c.kind === 'team') {
        const target = backend.rows.find(r => r.id === c.teamId);
        const roots = backend.rows.filter(r => !r.parentId);
        if (target && !target.parentId && roots.length <= 1) return false; // giữ ≥1 team gốc
        removeTeam && removeTeam(c.teamId);
        return false;
      }
      return false;
    });

    // SỬA (đổi tên / kéo giãn bar / dời milestone) → mirror vào model sau khi SVAR áp dụng.
    a.on('update-task', ({ id, task }) => {
      if (!task) return;
      const c = classify(id);
      if (c.kind === 'team' && task.text != null) {
        setRow && setRow(c.teamId, 'name', task.text);
      } else if (c.kind === 'phase') {
        const field = PHASE_FIELD[c.phase];
        if (field && task.wkd != null && task.wkd !== '') {
          // Sửa trực tiếp ô WKD trong lưới → set số ngày làm việc.
          setRow && setRow(c.teamId, field, num(task.wkd));
        } else if (field && (task.start || task.end)) {
          // Kéo giãn bar → quy ngược ra WKD (diffWkd bỏ cuối tuần).
          const cur = a.getTask(id) || {};
          const st = toStr(task.start || cur.start);
          const en = toStr(task.end || cur.end);
          if (st && en) setRow && setRow(c.teamId, field, num(diffWkd(st, en)));
        }
      } else if (c.kind === 'milestone' && task.start) {
        setMilestone && setMilestone(c.msId, 'date', toStr(task.start));
      } else if (c.kind === 'kickoff' && task.start) {
        setField && setField('startDate', toStr(task.start));
      } else if (c.kind === 'deadline' && task.start) {
        setField && setField('studioDeadline', toStr(task.start));
      }
    });

    // THÊM task từ SVAR → định tuyến sang addChild / addTeam của model.
    a.on('add-task', ({ target }) => {
      const c = target != null ? classify(target) : { kind: 'team' };
      if (c.kind === 'team' && c.teamId) addChild && addChild(c.teamId);
      else if (c.kind === 'phase' && c.teamId) addChild && addChild(c.teamId);
      else addTeam && addTeam();
    });

    setApi(a);
  };

  // Tô sáng cột "hôm nay".
  const highlightTime = (date, unit) => (unit === 'day' && toStr(date) === today ? 'ip-today-col' : '');

  return (
    <Willow>
      <div className="svar-gantt-host">
        {api && <Toolbar api={api} />}
        <ContextMenu api={api}>
          <SvarGantt
            key={sig}
            init={init}
            tasks={data.tasks}
            links={data.links}
            scales={data.scales}
            columns={COLUMNS}
            start={data.start}
            end={data.end}
            lengthUnit="day"
            cellWidth={34}
            cellHeight={34}
            highlightTime={highlightTime}
          />
        </ContextMenu>
        {api && <Editor api={api} />}
      </div>
    </Willow>
  );
}
