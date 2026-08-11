import { useEffect, useState } from 'react';
import Gantt from './Gantt.jsx';
import { addDaysStr, diffDays, fmtFull, maxDate, parseDate, todayStr } from './date.js';

const STORAGE_KEY = 'integration-planner-v2';

function defaultPlan() {
  const today = todayStr();
  const mk = (name, c, r, d) => ({
    id: crypto.randomUUID(),
    name,
    contract: addDaysStr(today, c),
    ready: addDaysStr(today, r),
    done: addDaysStr(today, d),
  });
  return {
    gameName: 'Dragon Fortune',
    startDate: today,
    desiredApiDoc: addDaysStr(today, 7),
    studioDeadline: addDaysStr(today, 30),
    doneOutOfScope: false,
    rows: [
      mk('Team Infra', 3, 8, 18),
      mk('Team BO', 5, 11, 23),
      mk('Team Platform', 6, 13, 27),
      mk('Team BE', 4, 9, 21),
    ],
  };
}

function loadPlan() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPlan();
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved.rows) || !saved.rows.length) return defaultPlan();
    return { ...defaultPlan(), ...saved };
  } catch {
    return defaultPlan();
  }
}

function SlackBadge({ slack, targetLabel }) {
  if (slack === null) return <span className="delta delta-muted">Chưa đủ dữ liệu</span>;
  if (slack > 0) return <span className="delta delta-ok">✓ Sớm hơn {targetLabel} {slack} ngày</span>;
  if (slack === 0) return <span className="delta delta-ok">✓ Đúng {targetLabel}</span>;
  return <span className="delta delta-bad">✕ Trễ {targetLabel} {-slack} ngày</span>;
}

export default function App() {
  const [plan, setPlan] = useState(loadPlan);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  }, [plan]);

  const set = (field, value) => setPlan(p => ({ ...p, [field]: value }));
  const setRow = (id, field, value) =>
    setPlan(p => ({
      ...p,
      rows: p.rows.map(r => (r.id === id ? { ...r, [field]: value } : r)),
    }));
  const addTeam = () =>
    setPlan(p => ({
      ...p,
      rows: [
        ...p.rows,
        { id: crypto.randomUUID(), name: `Team ${p.rows.length + 1}`, contract: '', ready: '', done: '' },
      ],
    }));
  const removeTeam = id =>
    setPlan(p => (p.rows.length <= 1 ? p : { ...p, rows: p.rows.filter(r => r.id !== id) }));

  const outOfScope = plan.doneOutOfScope;

  const feContract = maxDate(...plan.rows.map(r => r.contract));
  const feReady = maxDate(...plan.rows.map(r => r.ready));
  const projectDone = maxDate(...plan.rows.map(r => r.done));

  const apiSlack =
    feContract && plan.desiredApiDoc ? diffDays(feContract, plan.desiredApiDoc) : null;
  const doneSlack =
    projectDone && plan.studioDeadline ? diffDays(projectDone, plan.studioDeadline) : null;

  const canJudge = apiSlack !== null && (outOfScope || doneSlack !== null);
  const accepted = canJudge && apiSlack >= 0 && (outOfScope || doneSlack >= 0);

  const problems = [];
  if (apiSlack !== null && apiSlack < 0) problems.push(`trễ mốc API Doc ${-apiSlack} ngày`);
  if (!outOfScope && doneSlack !== null && doneSlack < 0)
    problems.push(`trễ Deadline Studio ${-doneSlack} ngày`);

  const invalidReady = r => !!(r.contract && r.ready && parseDate(r.ready) < parseDate(r.contract));
  const invalidDone = r => !!(r.ready && r.done && parseDate(r.done) < parseDate(r.ready));

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Integration Planner</h1>
          <p className="subtitle">
            Timeline Backend có đáp ứng mốc nhận API Doc &amp; Deadline của Studio không?
          </p>
        </div>
        <div className="header-right">
          <span className="game-pill">🎮 {plan.gameName || 'Chưa đặt tên'}</span>
          <button className="btn-reset" onClick={() => setPlan(defaultPlan())}>
            Reset mặc định
          </button>
        </div>
      </header>

      <section className="card chart-card">
        <h2>Timeline</h2>
        <Gantt plan={plan} feContract={feContract} feReady={feReady} projectDone={projectDone} />
      </section>

      <section className="top-grid">
        <div className="card">
          <h2>Studio</h2>
          <p className="card-note">Yêu cầu từ phía Studio / khách hàng</p>
          <div className="studio-grid">
            <label className="field">
              <span>Game Name</span>
              <input
                type="text"
                value={plan.gameName}
                placeholder="Tên game"
                onChange={e => set('gameName', e.target.value)}
              />
            </label>
            <label className="field">
              <span>KickOff Date (Mốc 1)</span>
              <input
                type="date"
                value={plan.startDate}
                onChange={e => set('startDate', e.target.value)}
              />
            </label>
            <label className="field">
              <span>SignOff API mong muốn (nhận API Documentation)</span>
              <input
                type="date"
                value={plan.desiredApiDoc}
                onChange={e => set('desiredApiDoc', e.target.value)}
              />
            </label>
            <label className="field">
              <span>Deadline từ Studio</span>
              <input
                type="date"
                value={plan.studioDeadline}
                onChange={e => set('studioDeadline', e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="card be-card">
          <h2>Backend đáp ứng</h2>
          <p className="card-note">= MAX từng mốc của {plan.rows.length} team trong bảng dưới</p>

          <div className="be-row">
            <i className="be-dot dot-contract" />
            <span className="be-label">SignOff API (Mốc 2)</span>
            <span className="be-date">{fmtFull(feContract)}</span>
            <SlackBadge slack={apiSlack} targetLabel="mốc mong muốn" />
          </div>
          <div className="be-row">
            <i className="be-dot dot-dev" />
            <span className="be-label">Ready Integration (Mốc 3)</span>
            <span className="be-date">{fmtFull(feReady)}</span>
            <span className="delta delta-muted">Dev/Mock Done — FE integrate từ đây</span>
          </div>
          <div className="be-row">
            <i className="be-dot dot-enddev" />
            <span className="be-label">Development Done (Mốc 4)</span>
            <span className="be-date">{outOfScope ? 'Ngoài scope' : fmtFull(projectDone)}</span>
            {outOfScope ? (
              <span className="delta delta-muted">không đánh giá</span>
            ) : (
              <SlackBadge slack={doneSlack} targetLabel="Deadline Studio" />
            )}
          </div>

          <div className={`be-verdict ${accepted ? 'verdict-ok' : 'verdict-bad'}`}>
            {!canJudge
              ? '— Nhập đủ ngày để đánh giá'
              : accepted
                ? `✓ Chấp nhận được — ${
                    outOfScope
                      ? 'API Doc đúng hẹn (Development Done ngoài scope)'
                      : 'đáp ứng cả mốc API Doc & Deadline Studio'
                  }`
                : `✕ Không đạt — BE ${problems.join(', ')}, cần đàm phán lại plan`}
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Kế hoạch Backend — edit trực tiếp trong bảng</h2>
        <table className="summary-table edit-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>SignOff API</th>
              <th>Ready Integration</th>
              <th>
                Development Done
                <label className="oos-toggle">
                  <input
                    type="checkbox"
                    checked={outOfScope}
                    onChange={e => set('doneOutOfScope', e.target.checked)}
                  />
                  ngoài scope
                </label>
              </th>
              <th className="th-del" />
            </tr>
          </thead>
          <tbody>
            {plan.rows.map(r => (
              <tr key={r.id}>
                <td>
                  <input
                    className="cell-input cell-name"
                    type="text"
                    value={r.name}
                    placeholder="Tên team"
                    onChange={e => setRow(r.id, 'name', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="cell-input"
                    type="date"
                    value={r.contract}
                    onChange={e => setRow(r.id, 'contract', e.target.value)}
                  />
                </td>
                <td className={invalidReady(r) ? 'cell-invalid' : ''}>
                  <input
                    className="cell-input"
                    type="date"
                    value={r.ready}
                    title={invalidReady(r) ? 'Phải ≥ ngày SignOff API' : undefined}
                    onChange={e => setRow(r.id, 'ready', e.target.value)}
                  />
                </td>
                <td className={!outOfScope && invalidDone(r) ? 'cell-invalid' : ''}>
                  <input
                    className="cell-input"
                    type="date"
                    value={r.done}
                    disabled={outOfScope}
                    title={!outOfScope && invalidDone(r) ? 'Phải ≥ ngày Ready Integration' : undefined}
                    onChange={e => setRow(r.id, 'done', e.target.value)}
                  />
                </td>
                <td className="td-del">
                  {plan.rows.length > 1 && (
                    <button
                      className="btn-del"
                      title={`Xoá ${r.name}`}
                      onClick={() => removeTeam(r.id)}
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr className="total-row">
              <td>MAX (quyết định)</td>
              <td>{fmtFull(feContract)}</td>
              <td>{fmtFull(feReady)}</td>
              <td>{outOfScope ? '—' : fmtFull(projectDone)}</td>
              <td className="td-del" />
            </tr>
          </tbody>
        </table>
        <button className="btn-add" onClick={addTeam}>
          + Thêm team
        </button>
        <p className="logic-note">
          Sửa trực tiếp trong bảng — panel Backend &amp; biểu đồ phía trên cập nhật ngay. Mỗi mốc
          của Backend = ngày muộn nhất (MAX) của tất cả team. 4 mốc: KickOff → SignOff API → Ready
          Integration → Development Done (optional, có thể đánh dấu ngoài scope).
        </p>
      </section>
    </div>
  );
}
