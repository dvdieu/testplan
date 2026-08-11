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

function phaseLabels(itemLabel) {
  return {
    contract: `${itemLabel} → SignOff (Mốc 2)`,
    dev: 'Dev → Ready Integration (Mốc 3 · Dev/Mock Done)',
    enddev: '→ Development Done (Mốc 4, optional)',
  };
}

// `rows` là plan.rows đã resolve — SignOff API lưu dạng số ngày, App tính ra `contract`.
export default function Gantt({ plan, rows, feContract, feReady, projectDone, itemLabel = 'API', desiredLabel = 'SignOff mong muốn' }) {
  const plotRef = useRef(null);
  const [tip, setTip] = useState(null);
  const today = todayStr();

  const { startDate, desiredApiDoc, desiredReady, studioDeadline, oos } = plan;
  const PHASE_LABEL = phaseLabels(itemLabel);

  const bars = rows
    .map(r => {
      const contract = oos.signoff ? null : r.contract;
      const ready = oos.ready ? null : r.ready;
      const done = oos.done ? null : r.done;
      const segs = [];
      if (startDate && contract && parseDate(contract) > parseDate(startDate)) {
        segs.push({ from: startDate, to: contract, phase: 'contract' });
      }
      const devFrom = oos.signoff ? startDate : feContract || contract || startDate;
      if (devFrom && ready && parseDate(ready) > parseDate(devFrom)) {
        segs.push({ from: devFrom, to: ready, phase: 'dev' });
      }
      if (ready && done && parseDate(done) > parseDate(ready)) {
        segs.push({ from: ready, to: done, phase: 'enddev' });
      }
      return { id: r.id, name: r.name || 'Team ?', segs, end: maxDate(contract, ready, done) };
    })
    .filter(r => r.segs.length > 0);

  const feWindow =
    !oos.ready && feReady && studioDeadline && parseDate(studioDeadline) > parseDate(feReady)
      ? { from: feReady, to: studioDeadline }
      : null;
  const showFeRow = !oos.ready;

  // Build visible dates list — only items that will actually render.
  // Deadline Studio là mốc cố định của Studio, luôn hiển thị bất kể OOS.
  const visibleDates = [startDate, studioDeadline, today];
  if (!oos.signoff) {
    visibleDates.push(desiredApiDoc, feContract);
  }
  if (!oos.ready) {
    visibleDates.push(desiredReady, feReady);
  }
  if (!oos.done) {
    visibleDates.push(projectDone);
  }
  bars.forEach(r => {
    r.segs.forEach(seg => {
      visibleDates.push(seg.from, seg.to);
    });
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
    !oos.signoff &&
      feContract && { date: feContract, label: `${itemLabel} (M2)`, cls: 'signoff', owner: 'be' },
    !oos.ready &&
      feReady && {
        date: feReady,
        label: 'Ready Integration (M3 · Dev/Mock Done)',
        cls: 'readyint',
        owner: 'be',
      },
    !oos.done &&
      projectDone && { date: projectDone, label: 'Dev Done (M4)', cls: 'devdone', owner: 'be' },
    !oos.signoff &&
      desiredApiDoc && {
        date: desiredApiDoc,
        label: desiredLabel,
        cls: 'desired',
        owner: 'studio',
      },
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

  // Waterfall flags: one row per marker, sorted by date — KickOff (earliest) on
  // top, each later milestone one step lower. Rows never overlap by construction.
  const FLAG_STEP = 26;
  const flagged = markers.map((m, i) => ({ ...m, lv: i }));
  const flagAreaH = markers.length * FLAG_STEP + 6;

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
          {bars.map(r => (
            <div key={r.id} className="gantt-name">
              {r.name}
            </div>
          ))}
          {showFeRow && <div className="gantt-name fe-name">FE Integration</div>}
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

          {bars.map(r => (
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
                      `${diffWkd(seg.from, seg.to)} ngày`,
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

          {showFeRow && (
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
                      `${diffWkd(feWindow.from, feWindow.to)} ngày trước Deadline Studio`,
                    ])
                  }
                >
                  <div className="seg seg-fe">
                    <span className="seg-fe-label">{diffWkd(feWindow.from, feWindow.to)} ngày</span>
                  </div>
                </div>
              ) : (
                <span className="fe-none">✕ Không còn thời gian integration trước Deadline Studio</span>
              )}
            </div>
          )}

          {!bars.length && !showFeRow && (
            <div className="gantt-row gantt-empty-row">
              <span className="fe-none">✕ Tất cả các mốc Backend đã được ẩn — tick bỏ "ngoài scope" để xem timeline.</span>
            </div>
          )}

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
        {!oos.signoff && (
          <span className="legend-item">
            <i className="chip chip-contract" />
            API → SignOff
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
            → Development Done (optional)
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
