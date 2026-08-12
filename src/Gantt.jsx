import { useRef, useState } from 'react';
import {
  addDaysStr,
  diffDays,
  diffWkd,
  fmtFull,
  fmtShort,
  maxDate,
  minDate,
  parseDate,
  todayStr,
} from './date.js';

const num = v => Math.max(0, Math.round(Number(v) || 0));

// Mỗi team = 1 task cha (summary). 3 phase = 3 task con 1 cấp, mỗi con 1 bar + 1 Duration.
// Duration nhập bằng số ngày làm việc; Start suy ra theo chuỗi (xem resolveRows ở PlannerPage).
function teamPhases(r, plan, feContract, itemLabel) {
  const { startDate, oos } = plan;
  const devFrom = oos.signoff ? startDate : feContract || r.contract || startDate;
  return [
    {
      key: 'contract',
      field: 'contractDays',
      name: `${itemLabel} → SignOff`,
      phase: 'contract',
      from: startDate,
      to: r.contract,
      oos: oos.signoff,
    },
    {
      key: 'dev',
      field: 'readyDays',
      name: 'Ready Integration',
      phase: 'dev',
      from: devFrom,
      to: r.ready,
      oos: oos.ready,
    },
    {
      key: 'done',
      field: 'doneDays',
      name: 'Development Done',
      phase: 'enddev',
      from: r.ready,
      to: r.done,
      oos: oos.done,
    },
  ];
}

export default function Gantt({
  plan,
  rows,
  feContract,
  feReady,
  projectDone,
  itemLabel = 'API',
  desiredLabel = 'SignOff mong muốn',
  setRow,
  addTeam,
  addChild,
  removeTeam,
  setField,
}) {
  const plotRef = useRef(null);
  const [tip, setTip] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const today = todayStr();

  const { startDate, desiredApiDoc, desiredReady, studioDeadline, oos } = plan;

  const toggle = id =>
    setCollapsed(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const setDays = (id, field) => e =>
    setRow(id, field, e.target.value === '' ? '' : num(e.target.value));

  // Flatten teams (cha) + their phases (con 1 cấp) into an ordered schedule.
  const schedule = [];
  rows.forEach(r => {
    const depth = r.parentId ? 1 : 0;
    const phases = teamPhases(r, plan, feContract, itemLabel).filter(
      p => !p.oos && p.from && p.to && parseDate(p.to) > parseDate(p.from),
    );
    const start = minDate(...phases.map(p => p.from)) || startDate;
    const end = maxDate(...phases.map(p => p.to));
    schedule.push({
      kind: 'team',
      id: r.id,
      depth,
      name: r.name || 'Team ?',
      start,
      end,
      dur: start && end ? diffWkd(start, end) : 0,
      hasKids: phases.length > 0,
      collapsed: collapsed.has(r.id),
    });
    if (!collapsed.has(r.id)) {
      phases.forEach(p =>
        schedule.push({
          kind: 'leaf',
          id: `${r.id}-${p.key}`,
          teamId: r.id,
          depth: depth + 1,
          name: p.name,
          field: p.field,
          days: r[p.field],
          from: p.from,
          to: p.to,
          phase: p.phase,
          start: p.from,
          dur: diffWkd(p.from, p.to),
        }),
      );
    }
  });

  const feWindow =
    !oos.ready && feReady && studioDeadline && parseDate(studioDeadline) > parseDate(feReady)
      ? { from: feReady, to: studioDeadline }
      : null;
  const showFeRow = !oos.ready;
  if (showFeRow) {
    schedule.push({
      kind: 'fe',
      id: '__fe__',
      depth: 0,
      name: 'FE Integration',
      start: feWindow ? feWindow.from : feReady,
      end: feWindow ? feWindow.to : null,
      dur: feWindow ? diffWkd(feWindow.from, feWindow.to) : 0,
      window: feWindow,
    });
  }

  // X domain — only dates that actually render.
  const visibleDates = [startDate, studioDeadline, today];
  if (!oos.signoff) visibleDates.push(desiredApiDoc, feContract);
  if (!oos.ready) visibleDates.push(desiredReady, feReady);
  if (!oos.done) visibleDates.push(projectDone);
  schedule.forEach(row => {
    if (row.kind === 'leaf') visibleDates.push(row.from, row.to);
    else visibleDates.push(row.start, row.end);
  });

  const lo = minDate(...visibleDates);
  const hi = maxDate(...visibleDates);
  if (!lo || !hi) return <p className="gantt-empty">Nhập ngày để hiển thị biểu đồ.</p>;

  const min = addDaysStr(lo, -2);
  const total = Math.max(diffDays(min, addDaysStr(hi, 4)), 1);
  const pos = d => (diffDays(min, d) / total) * 100;

  const step = [1, 2, 3, 5, 7, 14, 28].find(s => total / s <= 11) || 56;
  const ticks = [];
  for (let i = 0; i <= total; i += step) ticks.push(addDaysStr(min, i));

  const weekends = [];
  for (let i = 0; i <= total; i++) {
    if (new Date(parseDate(addDaysStr(min, i))).getUTCDay() === 6) weekends.push(i);
  }

  // owner drives flag color: 'studio' = tím (mục tiêu), 'be' = trắng + chấm khớp bar, 'now' = xám.
  const markers = [
    startDate && { date: startDate, label: 'KickOff (M1)', cls: 'kickoff', owner: 'studio' },
    { date: today, label: 'Hôm nay', cls: 'today', owner: 'now' },
    !oos.signoff &&
      feContract && { date: feContract, label: `${itemLabel} (M2)`, cls: 'signoff', owner: 'be' },
    !oos.ready &&
      feReady && {
        date: feReady,
        label: 'Ready Integration (M3)',
        cls: 'readyint',
        owner: 'be',
      },
    !oos.done &&
      projectDone && { date: projectDone, label: 'Dev Done (M4)', cls: 'devdone', owner: 'be' },
    !oos.signoff &&
      desiredApiDoc && { date: desiredApiDoc, label: desiredLabel, cls: 'desired', owner: 'studio' },
    !oos.ready &&
      desiredReady && {
        date: desiredReady,
        label: 'Integration mong muốn',
        cls: 'desiredready',
        owner: 'studio',
      },
    studioDeadline && {
      date: studioDeadline,
      label: 'Deadline Studio',
      cls: 'deadline',
      owner: 'studio',
    },
  ]
    .filter(Boolean)
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));

  const FLAG_STEP = 26;
  const flagged = markers.map((m, i) => ({ ...m, lv: i }));
  const flagAreaH = markers.length * FLAG_STEP + 6;

  const showTip = (e, lines) => {
    const rect = plotRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setTip({ x, y: e.clientY - rect.top, lines, flip: x / rect.width > 0.62 });
  };

  return (
    <div className="msp">
      <div className="msp-toolbar">
        <div className="oos-group">
          <span className="oos-group-label">Ngoài scope:</span>
          <label className="oos-toggle">
            <input
              type="checkbox"
              checked={oos.signoff}
              onChange={e => setField('oos', { ...oos, signoff: e.target.checked })}
            />
            {itemLabel}
          </label>
          <label className="oos-toggle">
            <input
              type="checkbox"
              checked={oos.ready}
              onChange={e => setField('oos', { ...oos, ready: e.target.checked })}
            />
            Ready Integration
          </label>
          <label className="oos-toggle">
            <input
              type="checkbox"
              checked={oos.done}
              onChange={e => setField('oos', { ...oos, done: e.target.checked })}
            />
            Development Done
          </label>
        </div>
        <button className="btn-add" onClick={addTeam}>
          + Thêm team
        </button>
      </div>

      <div className="msp-scroll">
        <div className="msp-grid">
          {/* ---- header band: column titles (left) + flags & axis (right) ---- */}
          <div className="msp-head" style={{ height: flagAreaH + 28 + 'px' }}>
            <div className="msp-left-head">
              <span className="col-name">Task Name</span>
              <span className="col-start">Start</span>
              <span className="col-dur">Duration</span>
            </div>
            <div className="msp-right-head">
              <div className="flag-area" style={{ height: flagAreaH + 'px' }}>
                {flagged.map(m => (
                  <span
                    key={m.cls}
                    className={`flag flag-${m.cls} own-${m.owner}`}
                    style={{ left: pos(m.date) + '%', top: m.lv * FLAG_STEP + 'px' }}
                  >
                    {m.owner !== 'now' && (
                      <b className="flag-owner">{m.owner === 'studio' ? 'STUDIO' : 'BE'}</b>
                    )}
                    {m.label} · {fmtShort(m.date)}
                  </span>
                ))}
              </div>
              <div className="axis-area">
                {ticks.map(t => (
                  <span key={t} className="tick" style={{ left: pos(t) + '%' }}>
                    {fmtShort(t)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ---- body: task list (left) + bars (right) ---- */}
          <div className="msp-body">
            <div className="msp-left">
              {schedule.map(row => (
                <div key={row.id} className={`msp-lrow lrow-${row.kind}`}>
                  <div className="msp-cell-name" style={{ paddingLeft: 8 + row.depth * 18 + 'px' }}>
                    {row.kind === 'team' ? (
                      <>
                        <button
                          className={`msp-caret ${row.hasKids ? '' : 'caret-empty'}`}
                          onClick={() => row.hasKids && toggle(row.id)}
                          title={row.collapsed ? 'Mở' : 'Thu gọn'}
                        >
                          {row.hasKids ? (row.collapsed ? '▸' : '▾') : '·'}
                        </button>
                        <input
                          className="cell-input cell-name"
                          type="text"
                          value={row.name}
                          placeholder="Tên team"
                          onChange={e => setRow(row.id, 'name', e.target.value)}
                        />
                        <span className="row-actions">
                          <button
                            className="btn-add-child"
                            title={`Thêm task con cho ${row.name}`}
                            onClick={() => addChild(row.id)}
                          >
                            +
                          </button>
                          <button
                            className="btn-del"
                            title={`Xoá ${row.name}`}
                            onClick={() => removeTeam(row.id)}
                          >
                            ×
                          </button>
                        </span>
                      </>
                    ) : row.kind === 'leaf' ? (
                      <>
                        <i className={`phase-dot dot-${row.phase}`} />
                        <span className="leaf-name">{row.name}</span>
                      </>
                    ) : (
                      <>
                        <i className="phase-dot dot-fe" />
                        <span className="leaf-name fe-leaf-name">{row.name}</span>
                      </>
                    )}
                  </div>
                  <div className="msp-cell-start">{fmtShort(row.start)}</div>
                  <div className="msp-cell-dur">
                    {row.kind === 'leaf' ? (
                      <span className="dur-edit">
                        <input
                          className="cell-input cell-days"
                          type="number"
                          min="0"
                          step="1"
                          value={row.days}
                          onChange={setDays(row.teamId, row.field)}
                        />
                        <span className="days-unit">d</span>
                      </span>
                    ) : (
                      <span className="dur-total">{row.dur}d</span>
                    )}
                    <span className="dur-end">{fmtShort(row.end || row.to)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="msp-right" ref={plotRef} onMouseLeave={() => setTip(null)}>
              <div className="msp-layer">
                {weekends.map(i => (
                  <div
                    key={i}
                    className="weekend"
                    style={{
                      left: (i / total) * 100 + '%',
                      width: (Math.min(2, total - i) / total) * 100 + '%',
                    }}
                  />
                ))}
                {ticks.map(t => (
                  <div key={t} className="gridline" style={{ left: pos(t) + '%' }} />
                ))}
                {flagged.map(m => (
                  <div
                    key={m.cls}
                    className={`marker marker-${m.cls} own-${m.owner}`}
                    style={{ left: pos(m.date) + '%' }}
                  />
                ))}
              </div>

              {schedule.map(row => (
                <div key={row.id} className={`msp-brow brow-${row.kind}`}>
                  {row.kind === 'team' && row.start && row.end && (
                    <div
                      className="msp-summary"
                      style={{
                        left: pos(row.start) + '%',
                        width: Math.max(pos(row.end) - pos(row.start), 0.3) + '%',
                      }}
                      onMouseMove={e =>
                        showTip(e, [
                          `${row.name} (tổng)`,
                          `${fmtFull(row.start)} → ${fmtFull(row.end)}`,
                          `${row.dur} ngày làm việc`,
                        ])
                      }
                    />
                  )}
                  {row.kind === 'leaf' && (
                    <div
                      className="seg-hit"
                      style={{
                        left: pos(row.from) + '%',
                        width: Math.max(pos(row.to) - pos(row.from), 0.3) + '%',
                      }}
                      onMouseMove={e =>
                        showTip(e, [
                          `${row.name}`,
                          `${fmtFull(row.from)} → ${fmtFull(row.to)}`,
                          `${row.dur} ngày làm việc`,
                        ])
                      }
                    >
                      <div className={`seg seg-${row.phase}`} />
                    </div>
                  )}
                  {row.kind === 'fe' &&
                    (row.window ? (
                      <div
                        className="seg-hit"
                        style={{
                          left: pos(row.window.from) + '%',
                          width: Math.max(pos(row.window.to) - pos(row.window.from), 0.3) + '%',
                        }}
                        onMouseMove={e =>
                          showTip(e, [
                            'Cửa sổ FE Integration',
                            `${fmtFull(row.window.from)} → ${fmtFull(row.window.to)}`,
                            `${row.dur} ngày trước Deadline Studio`,
                          ])
                        }
                      >
                        <div className="seg seg-fe">
                          <span className="seg-fe-label">{row.dur} ngày</span>
                        </div>
                      </div>
                    ) : (
                      <span className="fe-none">✕ Không còn thời gian integration trước Deadline</span>
                    ))}
                </div>
              ))}

              {tip && (
                <div
                  className={`tooltip${tip.flip ? ' tooltip-flip' : ''}`}
                  style={{ left: tip.x, top: tip.y }}
                >
                  {tip.lines.map(l => (
                    <div key={l}>{l}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="legend">
        {!oos.signoff && (
          <span className="legend-item">
            <i className="chip chip-contract" />
            {itemLabel} → SignOff
          </span>
        )}
        {!oos.ready && (
          <span className="legend-item">
            <i className="chip chip-dev" />
            Dev → Ready Integration
          </span>
        )}
        {!oos.done && (
          <span className="legend-item">
            <i className="chip chip-enddev" />
            → Development Done
          </span>
        )}
        {!oos.ready && (
          <span className="legend-item">
            <i className="chip chip-fe" />
            Cửa sổ FE Integration
          </span>
        )}
        <span className="legend-sep" />
        <span className="legend-item">
          <i className="flag-key key-studio" />
          Mốc <b>STUDIO</b> — mục tiêu / ràng buộc
        </span>
        <span className="legend-item">
          <i className="flag-key key-be" />
          Mốc <b>BE</b> — kế hoạch thực tế (MAX các team)
        </span>
      </div>
    </div>
  );
}
