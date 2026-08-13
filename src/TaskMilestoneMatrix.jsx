// Ma trận Task ↔ Mốc Studio: mỗi phase của mỗi team (hàng) map tới MỘT mốc Studio (cột),
// ô cho biết BE có xong đúng/trước mốc đó không (✓/✕). Bấm ô để đổi mốc mục tiêu;
// bấm lại ô đang ghim → về "auto" (đoán theo status qua resolvePhaseMs).
import { resolvePhaseMs } from './model.js';
import { diffWkd, fmtFull, parseDate } from './date.js';

const DEADLINE_ID = '__deadline__';

// 3 phase của model: ngày kết thúc thực tế + cờ ngoài-scope + nhãn ngắn.
const PHASE_DEFS = [
  { key: 'contract', dateKey: 'contract', oos: 'signoff', short: 'SignOff' },
  { key: 'dev', dateKey: 'ready', oos: 'ready', short: 'Ready' },
  { key: 'done', dateKey: 'done', oos: 'done', short: 'Done' },
];

// So ngày BE (taskDate) với ngày mốc (msDate). met = BE xong ĐÚNG/TRƯỚC mốc.
// diffWkd luôn ≥ 0 → tự suy dấu bằng so sánh ngày, lấy độ lớn theo chiều đúng.
function compare(taskDate, msDate) {
  if (!taskDate || !msDate) return null;
  const met = parseDate(taskDate) <= parseDate(msDate);
  const days = met ? diffWkd(taskDate, msDate) : diffWkd(msDate, taskDate);
  return { met, days };
}

export default function TaskMilestoneMatrix({ plan, backend, setField, collapsed = false, onToggle }) {
  const taskMs = plan.taskMs || {};
  const oos = plan.oos || {};

  // Cột = mốc Studio có ngày + Deadline Studio, sắp theo ngày tăng dần.
  const cols = [
    ...(plan.milestones || [])
      .filter(m => m.date)
      .map(m => ({ id: m.id, label: m.type, sub: m.status, date: m.date })),
    ...(plan.studioDeadline ? [{ id: DEADLINE_ID, label: 'Deadline', sub: 'Studio', date: plan.studioDeadline }] : []),
  ].sort((a, b) => parseDate(a.date) - parseDate(b.date));

  // Hàng = mỗi (team × phase) trong scope, kèm ngày kết thúc + mốc đang map (ghim hoặc auto).
  const rows = [];
  backend.rows.forEach(r => {
    PHASE_DEFS.forEach(p => {
      if (oos[p.oos]) return;
      const date = r[p.dateKey];
      if (!date) return;
      const id = `${r.id}::${p.key}`;
      const guess = resolvePhaseMs(plan, p.key)?.id || (p.key === 'done' ? DEADLINE_ID : null);
      rows.push({
        id,
        teamName: r.name || 'Team ?',
        child: !!r.parentId,
        short: p.short,
        date,
        effMsId: taskMs[id] ?? guess,
        explicit: taskMs[id] != null,
      });
    });
  });

  // Bấm ô: ghim task → mốc; bấm lại ô đang ghim → xoá ghim (về auto).
  const setMap = (taskId, msId) => {
    const cur = plan.taskMs || {};
    if (cur[taskId] === msId) {
      const next = { ...cur };
      delete next[taskId];
      setField('taskMs', next);
    } else {
      setField('taskMs', { ...cur, [taskId]: msId });
    }
  };

  if (!cols.length || !rows.length) {
    return (
      <section className="card matrix-card">
        <div className="chart-head"><h2>Mapping Task ↔ Mốc Studio</h2></div>
        <p className="logic-note">Chưa đủ dữ liệu — cần ít nhất 1 mốc Studio có ngày và 1 task trong scope.</p>
      </section>
    );
  }

  // Tổng kết đạt / trễ (theo mốc đang map của từng hàng).
  let metCount = 0;
  let lateCount = 0;
  rows.forEach(row => {
    const col = cols.find(c => c.id === row.effMsId);
    const cmp = col && compare(row.date, col.date);
    if (cmp) cmp.met ? metCount++ : lateCount++;
  });

  return (
    <section className={`card matrix-card${collapsed ? ' is-collapsed' : ''}`}>
      <div className="chart-head card-head" onClick={onToggle} role="button" tabIndex={0}>
        <button type="button" className="card-collapse" aria-expanded={!collapsed} aria-label="Thu gọn / mở">{collapsed ? '▸' : '▾'}</button>
        <h2>Mapping Task ↔ Mốc Studio — có đáp ứng timeline?</h2>
        <span className={`matrix-tally ${lateCount ? 'tally-bad' : 'tally-ok'}`}>
          {lateCount ? `✕ ${lateCount} task trễ` : `✓ ${metCount} task đạt`}
        </span>
      </div>

      <div className="card-body">
      <div className="matrix-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th className="mx-corner">Task ＼ Mốc</th>
              {cols.map(c => (
                <th key={c.id} className="mx-col">
                  <span className="mx-col-label">{c.label}</span>
                  <span className="mx-col-sub">{c.sub}</span>
                  <span className="mx-col-date">{fmtFull(c.date)}</span>
                </th>
              ))}
              <th className="mx-status-h">Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const col = cols.find(c => c.id === row.effMsId);
              const cmp = col && compare(row.date, col.date);
              return (
                <tr key={row.id}>
                  <th className={`mx-row ${row.child ? 'mx-row-child' : ''}`}>
                    <span className="mx-row-team">{row.child ? '↳ ' : ''}{row.teamName}</span>
                    <span className="mx-row-phase">{row.short} · {fmtFull(row.date)}</span>
                  </th>
                  {cols.map(c => {
                    const mapped = row.effMsId === c.id;
                    const cc = mapped ? compare(row.date, c.date) : null;
                    const cls =
                      'mx-cell' +
                      (mapped ? ' mx-mapped' : '') +
                      (cc ? (cc.met ? ' mx-ok' : ' mx-bad') : '') +
                      (mapped && !row.explicit ? ' mx-auto' : '');
                    const title = mapped
                      ? cc
                        ? cc.met
                          ? `Đạt — BE xong sớm ${cc.days} ngày làm việc so với mốc`
                          : `Trễ ${cc.days} ngày làm việc so với mốc`
                        : ''
                      : `Bấm để map task này → mốc "${c.label} · ${c.sub}"`;
                    return (
                      <td key={c.id} className={cls} onClick={() => setMap(row.id, c.id)} title={title}>
                        {mapped ? (cc ? (cc.met ? '✓' : '✕') : '•') : '·'}
                      </td>
                    );
                  })}
                  <td className="mx-status">
                    {cmp ? (
                      cmp.met ? (
                        <span className="delta-ok">✓ {cmp.days === 0 ? 'đúng hạn' : `sớm ${cmp.days}d`}</span>
                      ) : (
                        <span className="delta-bad">✕ trễ {cmp.days}d</span>
                      )
                    ) : (
                      <span className="delta-muted">chưa map</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="logic-note">
        Mỗi <b>task</b> (mỗi phase của team) map tới <b>một mốc Studio</b> — bấm ô để đổi mốc mục tiêu; bấm lại ô đang chọn để về <i>auto</i> (đoán theo status).
        Ô <b style={{ color: 'var(--good-text)' }}>✓</b> = BE xong đúng/trước mốc; ô <b style={{ color: 'var(--critical)' }}>✕</b> = trễ. Ô mờ = map tự động; ô đậm = bạn đã ghim.
      </p>
      </div>
    </section>
  );
}
