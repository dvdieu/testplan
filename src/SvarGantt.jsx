import { useEffect, useMemo, useRef, useState } from 'react';
import { Gantt, Willow } from '@svar-ui/react-gantt';
import '@svar-ui/react-gantt/all.css';
import { addWkdStr, diffWkd, maxDate, minDate, parseDate } from './date.js';

const D = s => (s ? new Date(parseDate(s)) : undefined);
const num = v => Math.max(0, Math.round(Number(v) || 0));
// Date | 'YYYY-MM-DD' → 'YYYY-MM-DD' (local parts, tránh lệch timezone)
const iso = d => {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const FIELD = { contract: 'contractDays', dev: 'readyDays', done: 'doneDays' };

// SVAR: type nào KHÔNG có trong danh sách này bị ép về 'task' (mất màu).
// Đăng ký custom type → bar class = wx-<type> → tô màu qua CSS.
const TASK_TYPES = [
  { id: 'task', label: 'Task' },
  { id: 'summary', label: 'Nhóm' },
  { id: 'milestone', label: 'Mốc' },
  { id: 'contract', label: 'API→SignOff' },
  { id: 'dev', label: 'Ready' },
  { id: 'done', label: 'Done' },
  { id: 'fe', label: 'FE' },
];

// Team = summary task. 3 phase = child task (type = phase key → màu riêng qua .wx-bar.wx-<type>).
// Ngày suy từ WKD math (PlannerPage.resolveRows). Chỉ Duration + Task Name sửa được.
function buildTasks(plan, rows, feContract, itemLabel, openState, msCfg) {
  const { startDate, studioDeadline, feReady, oos } = plan._derived;

  const tasks = [];
  // Level 1: Project root — gom mọi team → gantt 3 cấp (Project ▸ Team ▸ Phase)
  const ROOT = 'root';
  const allStart = [];
  const allEnd = [];
  tasks.push({
    id: ROOT,
    text: `Backend — ${plan.gameName || 'Dự án'}`,
    type: 'summary', // 'project' không nằm trong taskTypes → render như bar; summary cho ngoặc nhóm
    parent: 0,
    open: openState[ROOT] !== false,
    kind: 'project',
  });

  rows.forEach(r => {
    const tid = `t${r.id}`;
    const parent = r.parentId ? `t${r.parentId}` : ROOT;

    const phases = [
      !oos.signoff && {
        key: 'contract',
        text: `${itemLabel} → SignOff`,
        from: startDate,
        to: r.contract,
      },
      !oos.ready && {
        key: 'dev',
        text: 'Ready Integration',
        from: oos.signoff ? startDate : feContract || r.contract,
        to: r.ready,
      },
      !oos.done && {
        key: 'done',
        text: 'Development Done',
        from: r.ready,
        to: r.done,
      },
    ].filter(p => p && p.from && p.to && parseDate(p.to) > parseDate(p.from));

    const start = minDate(...phases.map(p => p.from)) || startDate;
    // Team 0 ngày / chưa nhập → không có phase nào ⇒ end = null.
    // SVAR crash (null.forEach) nếu summary thiếu end → cho span tối thiểu 1 WKD.
    let end = maxDate(...phases.map(p => p.to));
    if (start && !end) end = addWkdStr(start, 1);
    if (start) allStart.push(start);
    if (end) allEnd.push(end);

    tasks.push({
      id: tid,
      text: r.name || 'Team ?',
      type: 'summary',
      parent,
      open: openState[tid] !== false,
      start: D(start),
      end: D(end),
      wd: start && end ? diffWkd(start, end) : 0,
      teamId: r.id,
      kind: 'team',
    });

    phases.forEach(p =>
      tasks.push({
        id: `${tid}~${p.key}`,
        text: p.text,
        type: p.key, // custom type → .wx-bar.wx-contract / .wx-dev / .wx-done
        parent: tid,
        start: D(p.from),
        end: D(p.to),
        wd: diffWkd(p.from, p.to),
        // Level-2 (phase) → tham chiếu mốc Studio: ms = id (combo chọn), msLabel = hiển thị
        ms: (msCfg && msCfg.sel[p.key]) || '',
        msLabel: (msCfg && msCfg.label[p.key]) || '',
        phaseKey: p.key,
        teamId: r.id,
        field: FIELD[p.key],
        kind: 'leaf',
      }),
    );
  });

  if (!oos.ready && feReady && studioDeadline && parseDate(studioDeadline) > parseDate(feReady)) {
    tasks.push({
      id: 'fe',
      text: 'FE Integration',
      type: 'fe',
      parent: ROOT,
      start: D(feReady),
      end: D(studioDeadline),
      wd: diffWkd(feReady, studioDeadline),
      kind: 'fe',
    });
    allStart.push(feReady);
    allEnd.push(studioDeadline);
  }

  // Studio milestones (diamonds) — KickOff + Deadline cố định + mốc động (Loại·Status)
  const ms = [
    startDate && { t: 'KickOff (M1)', d: startDate },
    ...(plan.milestones || []).map(m => ({ t: `${m.type} · ${m.status}`, d: m.date })),
    plan.studioDeadline && { t: 'Deadline Studio', d: plan.studioDeadline },
  ]
    .filter(m => m && m.d)
    .sort((a, b) => parseDate(a.d) - parseDate(b.d));
  if (ms.length) {
    tasks.push({
      id: 'ms',
      text: '🎯 Mốc Studio',
      type: 'summary',
      parent: ROOT,
      open: openState.ms !== false,
      kind: 'msgroup',
    });
    ms.forEach((m, i) =>
      tasks.push({
        id: `ms${i}`,
        text: m.t,
        type: 'milestone',
        parent: 'ms',
        start: D(m.d),
        end: D(m.d),
        kind: 'ms',
      }),
    );
  }

  // fill project-root span from all teams
  const rootStart = minDate(...allStart);
  const rootEnd = maxDate(...allEnd);
  const root = tasks[0];
  root.start = D(rootStart);
  root.end = D(rootEnd);
  root.wd = rootStart && rootEnd ? diffWkd(rootStart, rootEnd) : 0;

  return tasks;
}

export default function SvarGantt({
  plan,
  rows,
  feContract,
  feReady,
  projectDone,
  itemLabel = 'API',
  setRow,
  setField, // (planField, value) — dùng cho StartDate (KickOff) & tên dự án
  addTeam,
  addChild,
  removeTeam,
  msOptions = [], // [{id,label}] mốc Studio động → combo cột Milestone
  phaseMsSel = {}, // {contract,dev,done} → id mốc đã chọn cho từng phase-key
  phaseMsLabel = {}, // {contract,dev,done} → nhãn hiển thị
  setPhaseMs, // (phaseKey, milestoneId) — lưu lựa chọn
}) {
  const apiRef = useRef(null);
  const wrapRef = useRef(null);
  const [openState, setOpenState] = useState({});

  // Nút xoá ✕ trong lưới: bắt click ở pha capture trên .svar-wrap (ổn định qua remount,
  // chạy trước handler của SVAR nên không bị stopPropagation nuốt mất).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onClick = e => {
      const cell = e.target.closest('.wx-cell');
      if (!cell) return;
      const colId = cell.getAttribute('data-col-id') || '';
      if (!colId.endsWith('del')) return;
      const rowEl = cell.closest('[data-id]');
      const dataId = rowEl && rowEl.getAttribute('data-id');
      if (!dataId) return;
      const api = apiRef.current;
      const task = api && api.getTask ? api.getTask(dataId.replace(/^:/, '')) : null;
      if (task && task.kind === 'team' && removeTeam) {
        e.stopPropagation();
        e.preventDefault();
        removeTeam(task.teamId);
      }
    };
    el.addEventListener('click', onClick, true);
    return () => el.removeEventListener('click', onClick, true);
  }, [removeTeam]);

  // pack derived dates so buildTasks stays pure
  const derived = { ...plan, _derived: { ...plan, feReady } };
  const msCfg = { sel: phaseMsSel, label: phaseMsLabel };

  const tasks = useMemo(
    () => buildTasks(derived, rows, feContract, itemLabel, openState, msCfg),
    [plan, rows, feContract, feReady, itemLabel, openState, phaseMsSel, phaseMsLabel],
  );

  // re-mount Gantt whenever the derived schedule / mốc mapping changes
  const dataKey = useMemo(
    () =>
      tasks
        .map(
          t =>
            `${t.id}:${t.text}:${t.wd}:${+(t.start || 0)}:${+(t.end || 0)}:${t.open}:${t.ms || ''}:${t.msLabel || ''}`,
        )
        .join('|') +
      '#' +
      msOptions.map(o => `${o.id}=${o.label}`).join(','),
    [tasks, msOptions],
  );

  const columns = [
    { id: 'text', header: 'Task Name', width: 196, minWidth: 150, editor: 'text' },
    {
      id: 'start',
      header: 'Start',
      width: 92,
      align: 'center',
      editor: 'datepicker',
      template: (v, task) =>
        task && task.start
          ? `${String(task.start.getDate()).padStart(2, '0')}/${String(
              task.start.getMonth() + 1,
            ).padStart(2, '0')}`
          : '',
    },
    {
      id: 'wd',
      header: 'Dur',
      width: 74,
      align: 'center',
      editor: 'text',
      template: v => (v != null ? `${v} ngày` : ''),
    },
    {
      id: 'ms',
      header: 'Milestone',
      width: 178,
      align: 'left',
      // options lọc bỏ các mốc đã được phase khác chọn (trừ option đang chọn của row hiện tại)
      options: task => {
        if (!task || task.kind !== 'leaf') return [];
        const selfId = (task.phaseKey && phaseMsSel[task.phaseKey]) || '';
        const used = new Set(
          Object.entries(phaseMsSel)
            .filter(([k, v]) => v && k !== task.phaseKey)
            .map(([, v]) => v),
        );
        return msOptions.filter(o => !used.has(o.id) || o.id === selfId);
      },
      editor: task => (task && task.kind === 'leaf' ? { type: 'richselect' } : false),
      template: (v, task) => (task && task.msLabel) || '',
    },
    {
      // Cột xoá: chỉ hàng team (kind='team') mới có dấu ✕ (click xử lý qua capture)
      id: 'del',
      header: '',
      width: 42,
      align: 'center',
      template: (v, task) =>
        task && task.kind === 'team'
          ? '<span class="svar-del" title="Xoá team">✕</span>'
          : '',
    },
  ];

  const scales = [
    {
      unit: 'month',
      step: 1,
      format: d => `${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`,
    },
    { unit: 'day', step: 1, format: d => String(d.getDate()) },
  ];

  const init = api => {
    apiRef.current = api;
    const cancel = () => false;
    // Khoá thao tác kéo/link — lịch suy từ WKD, chỉ sửa qua ô lưới
    api.intercept('drag-task', cancel);
    api.intercept('move-task', cancel);
    api.intercept('add-link', cancel);
    api.intercept('update-link', cancel);
    api.intercept('delete-link', cancel);
    api.intercept('indent-task', cancel);

    // Ẩn/hiện nhóm (giữ tính năng collapse)
    api.intercept('open-task', ev => {
      setOpenState(s => ({ ...s, [ev.id]: ev.mode }));
      return true;
    });

    // Sửa ô lưới: grid phát 'update-cell' → react-gantt exec 'update-task' với task ĐẦY ĐỦ.
    // Mọi field đều có mặt → phải SO SÁNH giá trị để biết cột nào thực sự đổi (theo thứ tự ưu tiên).
    api.intercept('update-task', ev => {
      const t = api.getTask(ev.id) || {};
      const ch = ev.task || {};
      if (t.kind === 'leaf' && t.field && ch.wd !== undefined && num(ch.wd) !== num(t.wd)) {
        setRow(t.teamId, t.field, num(ch.wd)); // Duration → *Days của phase
      } else if (t.kind === 'leaf' && t.phaseKey && ch.ms !== undefined && ch.ms !== t.ms) {
        // Chặn chọn trùng milestone cho phase khác
        const alreadyUsed = Object.entries(phaseMsSel).some(
          ([k, v]) => k !== t.phaseKey && v === ch.ms,
        );
        if (!alreadyUsed && setPhaseMs) setPhaseMs(t.phaseKey, ch.ms);
      } else if (ch.text !== undefined && ch.text !== t.text) {
        if (t.kind === 'team') setRow(t.teamId, 'name', ch.text); // Task Name → tên team
        else if (t.kind === 'project' && setField) setField('gameName', ch.text);
      } else if (
        ch.start !== undefined &&
        (t.kind === 'project' || t.field === 'contractDays') &&
        setField &&
        iso(ch.start) !== iso(t.start)
      ) {
        setField('startDate', iso(ch.start)); // Start (KickOff/M1) → plan.startDate
      }
      return false; // React state sở hữu data; re-mount phản ánh lại
    });

    // Cấu trúc: thêm/xoá team & con ngay trên chart
    api.intercept('add-task', ev => {
      const pid = ev.target != null ? ev.target : ev.task && ev.task.parent;
      const p = pid != null ? api.getTask(pid) : null;
      if (p && p.kind === 'team' && addChild) addChild(p.teamId);
      else if (addTeam) addTeam();
      return false;
    });
    api.intercept('delete-task', ev => {
      const t = api.getTask(ev.id) || {};
      if (t.kind === 'team' && removeTeam) removeTeam(t.teamId); // chỉ xoá team, không xoá phase
      return false;
    });

    // Click vào cột ✕ để xoá team (SVAR nuốt event, nên bắt capture trên body)
    const gridBody = wrapRef.current && wrapRef.current.querySelector('.wx-body');
    if (gridBody) {
      const clickDelete = e => {
        const cell = e.target.closest('.wx-cell[data-col-id="del"]');
        if (!cell) return;
        const row = cell.closest('[data-id]');
        if (!row) return;
        const rawId = row.getAttribute('data-id');
        const task = api.getTask(rawId) || api.getTask(rawId.replace(/^:/, ''));
        if (task && task.kind === 'team' && removeTeam) {
          e.stopPropagation();
          e.preventDefault();
          removeTeam(task.teamId);
        }
      };
      gridBody.addEventListener('click', clickDelete, true);
    }
  };

  return (
    <div className="svar-wrap" ref={wrapRef}>
      <Willow fonts={false}>
        <Gantt
          key={dataKey}
          init={init}
          tasks={tasks}
          taskTypes={TASK_TYPES}
          scales={scales}
          columns={columns}
          cellHeight={36}
          scaleHeight={34}
          cellWidth={34}
          durationUnit="day"
          lengthUnit="day"
          zoom={true}
          highlightTime={(d, unit) =>
            unit === 'day' && (d.getUTCDay() === 0 || d.getUTCDay() === 6) ? 'wx-weekend' : ''
          }
        />
      </Willow>
    </div>
  );
}
