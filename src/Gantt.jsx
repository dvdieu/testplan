import { useRef, useState } from 'react';
import {
  addDaysStr,
  diffDays,
  fmtFull,
  fmtShort,
  maxDate,
  minDate,
  parseDate,
  todayStr,
} from './date.js';

const PHASE_LABEL = {
  contract: 'API → SignOff (Mốc 2)',
  dev: 'Dev → Ready Integration (Mốc 3 · Dev/Mock Done)',
  enddev: '→ Development Done (Mốc 4, optional)',
};

export default function Gantt({ plan, feContract, feReady, projectDone }) {
  const plotRef = useRef(null);
  const [tip, setTip] = useState(null);
  const today = todayStr();

  const { startDate, desiredApiDoc, studioDeadline, doneOutOfScope } = plan;
  const all = [startDate, desiredApiDoc, studioDeadline, today, feReady];
  if (!doneOutOfScope) all.push(projectDone);
  plan.rows.forEach(r => {
    all.push(r.contract, r.ready);
    if (!doneOutOfScope) all.push(r.done);
  });

  const lo = minDate(...all);
  const hi = maxDate(...all);
  if (!lo || !hi) return <p className="gantt-empty">Nhập ngày để hiển thị biểu đồ.</p>;

  const min = addDaysStr(lo, -2);
  const total = Math.max(diffDays(min, addDaysStr(hi, 4)), 1);
  const pos = d => (diffDays(min, d) / total) * 100;

  const step = [1, 2, 3, 5, 7, 14, 28].find(s => total / s <= 11) || 56;
  const ticks = [];
  for (let i = 0; i <= total; i += step) ticks.push(addDaysStr(min, i));

  // Saturday indices → weekend shading bands (2 days wide, clipped at range end).
  const weekends = [];
  for (let i = 0; i <= total; i++) {
    if (new Date(parseDate(addDaysStr(min, i))).getUTCDay() === 6) weekends.push(i);
  }

  // owner drives the flag's color family: 'studio' = tím (mục tiêu / ràng buộc),
  // 'be' = trắng + chấm màu khớp bar (kế hoạch thực tế), 'now' = xám trung tính.
  const markers = [
    startDate && { date: startDate, label: 'KickOff (M1)', cls: 'kickoff', owner: 'studio' },
    { date: today, label: 'Hôm nay', cls: 'today', owner: 'now' },
    feContract && { date: feContract, label: 'SignOff API (M2)', cls: 'signoff', owner: 'be' },
    feReady && {
      date: feReady,
      label: 'Ready Integration (M3 · Dev/Mock Done)',
      cls: 'readyint',
      owner: 'be',
    },
    !doneOutOfScope &&
      projectDone && { date: projectDone, label: 'Dev Done (M4)', cls: 'devdone', owner: 'be' },
    desiredApiDoc && {
      date: desiredApiDoc,
      label: 'SignOff mong muốn',
      cls: 'desired',
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

  // Waterfall flags: one row per marker, sorted by date — KickOff (earliest) on
  // top, each later milestone one step lower. Rows never overlap by construction.
  const FLAG_STEP = 26;
  const flagged = markers.map((m, i) => ({ ...m, lv: i }));
  const flagAreaH = markers.length * FLAG_STEP + 6;

  const rows = plan.rows.map(r => {
    const done = doneOutOfScope ? null : r.done;
    const segs = [];
    if (startDate && r.contract && parseDate(r.contract) > parseDate(startDate)) {
      segs.push({ from: startDate, to: r.contract, phase: 'contract' });
    }
    const devFrom = feContract || r.contract || startDate;
    if (devFrom && r.ready && parseDate(r.ready) > parseDate(devFrom)) {
      segs.push({ from: devFrom, to: r.ready, phase: 'dev' });
    }
    if (r.ready && done && parseDate(done) > parseDate(r.ready)) {
      segs.push({ from: r.ready, to: done, phase: 'enddev' });
    }
    return { id: r.id, name: r.name || 'Team ?', segs, end: maxDate(r.contract, r.ready, done) };
  });

  const feWindow =
    feReady && studioDeadline && parseDate(studioDeadline) > parseDate(feReady)
      ? { from: feReady, to: studioDeadline }
      : null;

  const showTip = (e, lines) => {
    const rect = plotRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setTip({ x, y: e.clientY - rect.top, lines, flip: x / rect.width > 0.62 });
  };

  return (
    <div className="gantt">
      <div className="gantt-grid gantt-flagrow">
        <div />
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
      </div>

      <div className="gantt-grid">
        <div className="gantt-names">
          {rows.map(r => (
            <div key={r.id} className="gantt-name">
              {r.name}
            </div>
          ))}
          <div className="gantt-name fe-name">FE Integration</div>
        </div>

        <div className="gantt-plot" ref={plotRef} onMouseLeave={() => setTip(null)}>
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
              style={{
                left: pos(m.date) + '%',
                top: -(flagAreaH - m.lv * FLAG_STEP - 20) + 'px',
              }}
            />
          ))}

          {rows.map(r => (
            <div key={r.id} className="gantt-row">
              {r.segs.map(seg => (
                <div
                  key={seg.phase}
                  className="seg-hit"
                  style={{ left: pos(seg.from) + '%', width: pos(seg.to) - pos(seg.from) + '%' }}
                  onMouseMove={e =>
                    showTip(e, [
                      `${r.name} — ${PHASE_LABEL[seg.phase]}`,
                      `${fmtFull(seg.from)} → ${fmtFull(seg.to)}`,
                      `${diffDays(seg.from, seg.to)} ngày`,
                    ])
                  }
                >
                  <div className={`seg seg-${seg.phase}`} />
                </div>
              ))}
              {r.end && (
                <span className="end-label" style={{ left: pos(r.end) + '%' }}>
                  {fmtShort(r.end)}
                </span>
              )}
            </div>
          ))}

          <div className="gantt-row fe-row">
            {feWindow ? (
              <div
                className="seg-hit"
                style={{
                  left: pos(feWindow.from) + '%',
                  width: pos(feWindow.to) - pos(feWindow.from) + '%',
                }}
                onMouseMove={e =>
                  showTip(e, [
                    'Cửa sổ FE Integration',
                    `${fmtFull(feWindow.from)} → ${fmtFull(feWindow.to)}`,
                    `${diffDays(feWindow.from, feWindow.to)} ngày trước Deadline Studio`,
                  ])
                }
              >
                <div className="seg seg-fe">
                  <span className="seg-fe-label">{diffDays(feWindow.from, feWindow.to)} ngày</span>
                </div>
              </div>
            ) : (
              <span className="fe-none">✕ Không còn thời gian integration trước Deadline Studio</span>
            )}
          </div>

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

      <div className="gantt-grid gantt-axis">
        <div />
        <div className="axis-area">
          {ticks.map(t => (
            <span key={t} className="tick" style={{ left: pos(t) + '%' }}>
              {fmtShort(t)}
            </span>
          ))}
        </div>
      </div>

      <div className="legend">
        <span className="legend-item">
          <i className="chip chip-contract" />
          API → SignOff
        </span>
        <span className="legend-item">
          <i className="chip chip-dev" />
          Dev → Ready Integration
        </span>
        {!doneOutOfScope && (
          <span className="legend-item">
            <i className="chip chip-enddev" />
            → Development Done (optional)
          </span>
        )}
        <span className="legend-item">
          <i className="chip chip-fe" />
          Cửa sổ FE Integration
        </span>
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
