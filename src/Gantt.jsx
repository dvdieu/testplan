// Biểu đồ dựng trên SVAR React Gantt (@svar-ui/react-gantt) — dùng đúng như demo BasicInit:
//   <Gantt tasks links scales /> + Toolbar / ContextMenu / Editor (thêm/sửa/xoá NATIVE).
// Model của app (day-count WKD) vẫn là nguồn sự thật: seed SVAR từ backend đã tính, và ánh xạ
// mọi thao tác native (xoá/đổi tên/kéo giãn/thêm) NGƯỢC lại model qua api.intercept / api.on.
import { useMemo, useState } from 'react';
import { Gantt as SvarGantt, Willow, Toolbar, ContextMenu, Editor } from '@svar-ui/react-gantt';
import '@svar-ui/react-gantt/all.css';
import { addDaysStr, diffWkd, maxDate, minDate, parseDate, todayStr } from './date.js';
import { num } from './model.js';

// 'YYYY-MM-DD' → Date tại NỬA ĐÊM LOCAL. SVAR đọc giờ local và lengthUnit='day' làm tròn theo mốc
// nửa đêm: nếu để UTC-noon (12:00 → 19:00 giờ VN) thì END bị ceil lên ngày kế → MỌI bar dài dư 1 ô
// (task 3 WKD hiện 6 ô). Nửa đêm local khớp đúng biên ngày → độ dài bar = số ngày lịch thật start..end.
const D = s => {
  if (!s) return null;
  const [y, m, d] = String(s).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
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

  // SVAR sập khi summary KHÔNG có subtask: hoặc "Summary tasks must have start and end
  // dates..." (thiếu ngày), hoặc "Cannot read properties of null (reading 'forEach')" (SVAR
  // duyệt mảng con null). Xảy ra khi xoá phase CUỐI của 1 team (mọi WKD=0 → không phase nào
  // lọt filter, không team con) → team summary rỗng. Vá: hạ summary rỗng xuống 'task' (leaf)
  // + cho bar rỗng 1 ngày tại KickOff. Thêm lại WKD > 0 → rebuild thành summary như cũ.
  const referenced = new Set(tasks.map(t => t.parent).filter(Boolean));
  const fb = startDate || todayStr();
  tasks.forEach(t => {
    if (t.type === 'summary' && !referenced.has(t.id)) {
      t.type = 'task';
      t.open = false; // BẮT BUỘC: SVAR toArray đệ quy theo open===true, KHÔNG theo type;
      // nếu còn open:true mà data=null (không con) → Nt2(null).forEach → sập.
      t.start = D(fb);
      t.end = D(addDaysStr(fb, 1));
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

// Nhánh WBS: rows đã suy start/end (Sum tuần tự · Task song song · lá WKD) → SVAR tree native.
// Node có con = summary (bao con); lá = task (bar WKD, sửa được). Sum nối e2s để thấy chuỗi tuần tự.
function buildWbs(plan, backend) {
  const { startDate, studioDeadline, milestones = [] } = plan;
  const { rows } = backend;
  const tasks = [];
  const links = [];
  const dates = [startDate, studioDeadline, todayStr()];

  // Nhóm mốc Studio (tím) — giống nhánh 3-phase.
  tasks.push({ id: 'grp::studio', text: '🎯 Mốc Studio (mục tiêu)', type: 'summary', open: true });
  if (startDate) tasks.push({ id: 'ms::kickoff', parent: 'grp::studio', text: 'KickOff', type: 'milestone', start: D(startDate) });
  milestones.filter(m => m.date).forEach(m => {
    tasks.push({ id: `ms::${m.id}`, parent: 'grp::studio', text: `${m.type} · ${m.status}${m.hard ? ' 🔒' : ''}`, type: 'milestone', start: D(m.date) });
    dates.push(m.date);
  });
  if (studioDeadline) tasks.push({ id: 'ms::deadline', parent: 'grp::studio', text: 'Deadline Studio', type: 'milestone', start: D(studioDeadline) });

  const hasChild = id => rows.some(r => r.parentId === id);
  rows.forEach(r => {
    if (hasChild(r.id)) {
      // Summary CÓ start/end tường minh (resolveWbs đã suy) → SVAR khỏi tự duyệt con để tính span.
      tasks.push({ id: r.id, parent: r.parentId || 0, text: r.name || 'Nhóm ?', type: 'summary', open: true, start: D(r.start), end: D(r.end), wkd: r.wkdEff });
    } else if (num(r.wkd) === 0) {
      // Lá 0 ngày = MỐC (kim cương). Sum "Package" (đóng gói) = mốc hoàn thành dự án, đặt tại projectDone.
      tasks.push({ id: r.id, parent: r.parentId || 0, text: r.name || 'Mốc ?', type: 'milestone', start: D(r.start) });
    } else {
      tasks.push({ id: r.id, parent: r.parentId || 0, text: r.name || 'Task ?', type: 'task', start: D(r.start), end: D(r.end), progress: 0, wkd: num(r.wkd) });
    }
    dates.push(r.start, r.end);
  });

  // Chuỗi Sum tuần tự: nối e2s giữa các Sum gốc liên tiếp (mũi tên phụ thuộc).
  const sums = rows.filter(r => !r.parentId);
  for (let k = 1; k < sums.length; k++) {
    links.push({ id: `sum:l${k}`, source: sums[k - 1].id, target: sums[k].id, type: 'e2s' });
  }

  // Vá summary rỗng (Sum bị xoá hết con) → hạ xuống task stub 1 ngày, tránh SVAR sập (xem nhánh 3-phase).
  const referenced = new Set(tasks.map(t => t.parent).filter(Boolean));
  const fb = startDate || todayStr();
  tasks.forEach(t => {
    if (t.type === 'summary' && !String(t.id).startsWith('grp::') && !referenced.has(t.id)) {
      t.type = 'task';
      t.open = false;
      t.start = D(fb);
      t.end = D(addDaysStr(fb, 1));
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
  const [scrollDate, setScrollDate] = useState('');
  const [holidayDate, setHolidayDate] = useState('');
  const today = todayStr();

  const lengthUnit = plan.lengthUnit || 'day';
  const holidays = plan.holidays || [];
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);

  // Cuộn timeline tới 1 ngày (SVAR native: exec 'scroll-chart' với {date}).
  const scrollToDate = () => { if (api && scrollDate) api.exec('scroll-chart', { date: D(scrollDate) }); };
  const addHoliday = () => {
    if (!holidayDate || holidaySet.has(holidayDate)) return;
    setField && setField('holidays', [...holidays, holidayDate].sort());
    setHolidayDate('');
  };
  const removeHoliday = d => setField && setField('holidays', holidays.filter(x => x !== d));

  const isWbs = plan.template === 'wbs';
  const data = useMemo(
    () => (isWbs ? buildWbs(plan, backend) : buildData(plan, backend, itemLabel)),
    [isWbs, plan, backend, itemLabel],
  );
  // Remount SVAR khi cấu trúc/ngày đổi từ các panel khác → chart seed lại từ model.
  const sig = useMemo(() => JSON.stringify(data.tasks) + '|' + JSON.stringify(data.links), [data]);

  // init chạy mỗi lần (re)mount → closure luôn ôm props mới nhất (sig đổi ⇒ remount).
  const init = a => {
    // XOÁ: chặn default của SVAR (return false) rồi tự xoá trong model → remount phản ánh.
    a.intercept('delete-task', ({ id }) => {
      const c = classify(id);
      if (c.kind === 'group' || c.kind === 'kickoff' || c.kind === 'deadline') return false;
      if (c.kind === 'phase') {
        // Phase KHÔNG phải thực thể độc lập — 3 bar của team suy từ 3 số WKD. "Xoá" phase =
        // set WKD phase đó về 0 → bar/hàng thu lại, model vẫn nhất quán (remount vẽ lại).
        // Khôi phục: sửa WKD ở phase còn lại của team, hoặc nút "Reset mặc định".
        const field = PHASE_FIELD[c.phase];
        if (field) setRow && setRow(c.teamId, field, 0);
        return false;
      }
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
      if (c.kind === 'team') {
        if (task.text != null) setRow && setRow(c.teamId, 'name', task.text);
        // WBS: node lá sửa được WKD (ô lưới) hoặc kéo giãn bar → quy về số ngày làm việc.
        // Node nhóm (có con) chỉ đổi tên — độ dài bao theo con, không sửa trực tiếp.
        if (isWbs && !backend.rows.some(r => r.parentId === c.teamId)) {
          // Xét theo CÁI GÌ ĐỔI, không theo trường nào có mặt: Editor (page details) & kéo giãn bar
          // đều gửi task.wkd CŨ (== model) kèm start/end mới; sửa ô WKD trong lưới gửi wkd MỚI kèm
          // start/end cũ. So wkd payload với model → khác thì đó là sửa ô WKD; bằng (cũ) thì là đổi
          // ngày → quy WKD từ start/end (diffWkd bỏ cuối tuần). Payload dạng nào cũng đúng.
          const row = backend.rows.find(r => r.id === c.teamId) || {};
          const newWkd = task.wkd != null && task.wkd !== '' ? num(task.wkd) : null;
          if (newWkd != null && newWkd !== num(row.wkd)) {
            setRow && setRow(c.teamId, 'wkd', newWkd);
          } else if (task.start || task.end) {
            const cur = a.getTask(id) || {};
            const st = toStr(task.start || cur.start);
            const en = toStr(task.end || cur.end);
            if (st && en) setRow && setRow(c.teamId, 'wkd', num(diffWkd(st, en)));
          }
        }
      } else if (c.kind === 'phase') {
        const field = PHASE_FIELD[c.phase];
        const row = backend.rows.find(r => r.id === c.teamId) || {};
        const newWkd = task.wkd != null && task.wkd !== '' ? num(task.wkd) : null;
        if (field && newWkd != null && newWkd !== num(row[field])) {
          // Sửa trực tiếp ô WKD trong lưới → dùng số user nhập.
          setRow && setRow(c.teamId, field, newWkd);
        } else if (field && (task.start || task.end)) {
          // Kéo giãn bar / sửa ngày trong Editor (kèm wkd cũ == model) → quy WKD từ start/end.
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

  // Tô sáng cột: hôm nay > ngày nghỉ > cuối tuần (ngày không làm việc = nền xám, khớp phép tính WKD).
  const highlightTime = (date, unit) => {
    if (unit !== 'day') return '';
    const ds = toStr(date);
    if (ds === today) return 'ip-today-col';
    if (holidaySet.has(ds)) return 'ip-holiday-col';
    const wd = new Date(date).getDay();
    return wd === 0 || wd === 6 ? 'ip-weekend-col' : '';
  };

  return (
    <Willow>
      <div className="gantt-controls">
        <label className="gc-item">
          <span>Đơn vị (làm tròn)</span>
          <select value={lengthUnit} onChange={e => setField && setField('lengthUnit', e.target.value)}>
            <option value="hour">Giờ</option>
            <option value="day">Ngày</option>
            <option value="week">Tuần</option>
          </select>
        </label>
        <label className="gc-item">
          <span>Cuộn tới ngày</span>
          <span className="gc-inline">
            <input type="date" value={scrollDate} onChange={e => setScrollDate(e.target.value)} />
            <button type="button" className="gc-btn" onClick={scrollToDate} disabled={!scrollDate}>Cuộn</button>
          </span>
        </label>
        <label className="gc-item gc-holiday">
          <span>Ngày nghỉ (tính là ngày không làm việc)</span>
          <span className="gc-inline">
            <input type="date" value={holidayDate} onChange={e => setHolidayDate(e.target.value)} />
            <button type="button" className="gc-btn" onClick={addHoliday} disabled={!holidayDate}>+ Thêm</button>
          </span>
        </label>
        {holidays.length > 0 && (
          <div className="gc-chips">
            {holidays.map(d => (
              <span className="gc-chip" key={d}>
                {fmtDMY(D(d))}
                <button type="button" title="Bỏ ngày nghỉ" onClick={() => removeHoliday(d)}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>
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
            lengthUnit={lengthUnit}
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
