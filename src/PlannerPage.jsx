import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Gantt from './Gantt.jsx';
import { loadPlan, savePlan } from './storage.js';
import {
  addWkdStr,
  diffWkd,
  fmtFull,
  maxDate,
  parseDate,
  todayStr,
} from './date.js';

const num = v => Math.max(0, Math.round(Number(v) || 0));

// Bảng chỉ nhập số ngày làm việc (WKD); mọi ngày đều suy ra từ KickOff theo chuỗi:
//   SignOff API  = KickOff + contractDays
//   Ready Integ. = MAX(SignOff API) + readyDays
//   Dev Done     = Ready Integration + doneDays
function resolveRows(plan) {
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

function migrateRows(plan) {
  if (plan.rows.every(r => r.contractDays !== undefined && r.readyDays !== undefined && r.doneDays !== undefined)) return plan;
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
    return { ...rest, readyDays, doneDays, noe: rest.noe ?? false };
  });
  return { ...plan, rows };
}

function defaultPlan(projectName) {
  const today = todayStr();
  const mk = (name, contractDays, readyDays, doneDays, noe = false) => ({
    id: crypto.randomUUID(),
    name,
    contractDays,
    readyDays,
    doneDays,
    noe,
  });
  return {
    projectName,
    gameName: projectName,
    startDate: today,
    desiredApiDoc: addWkdStr(today, 7),
    desiredReady: addWkdStr(today, 14),
    studioDeadline: addWkdStr(today, 30),
    pic: '',
    oos: { signoff: false, ready: false, done: false },
    rows: [
      mk('Team Infra', 3, 2, 10, false),
      mk('Team BO', 5, 5, 12, true),
      mk('Team Platform', 6, 7, 14, false),
      mk('Team BE', 4, 3, 12, true),
    ],
  };
}

function migrateOos(saved) {
  if (saved.oos && typeof saved.oos === 'object') return saved.oos;
  return {
    signoff: false,
    ready: false,
    done: saved.doneOutOfScope === true,
  };
}

async function loadPlanAsync(projectName) {
  const remote = await loadPlan(projectName);
  if (remote) {
    const base = { ...defaultPlan(projectName), ...remote, oos: migrateOos(remote) };
    delete base.doneOutOfScope;
    return migrateRows(base);
  }
  return defaultPlan(projectName);
}

function SlackBadge({ slack, targetLabel }) {
  if (slack === null) return <span className="delta delta-muted">Chưa đủ dữ liệu</span>;
  if (slack > 0) return <span className="delta delta-ok">✓ Sớm hơn {targetLabel} {slack} ngày</span>;
  if (slack === 0) return <span className="delta delta-ok">✓ Đúng {targetLabel}</span>;
  return <span className="delta delta-bad">✕ Trễ {targetLabel} {-slack} ngày</span>;
}

export default function PlannerPage() {
  const { projectName } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(() => defaultPlan(projectName));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadPlanAsync(projectName).then(p => {
      setPlan(p);
      setLoading(false);
    });
  }, [projectName]);

  useEffect(() => {
    if (!loading) savePlan(projectName, plan);
  }, [plan, projectName, loading]);

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
        {
          id: crypto.randomUUID(),
          name: `Team ${p.rows.length + 1}`,
          contractDays: 0,
          readyDays: 0,
          doneDays: 0,
          noe: false,
        },
      ],
    }));
  const removeTeam = id =>
    setPlan(p => (p.rows.length <= 1 ? p : { ...p, rows: p.rows.filter(r => r.id !== id) }));

  const { oos } = plan;
  const rows = resolveRows(plan);
  const feContract = maxDate(...rows.map(r => r.contract));
  const feReady = maxDate(...rows.map(r => r.ready));
  const projectDone = maxDate(...rows.map(r => r.done));
  const maxContractDays = Math.max(...rows.map(r => num(r.contractDays)));
  const maxReadyDays = Math.max(...rows.map(r => num(r.readyDays)));
  const maxDoneDays = Math.max(...rows.map(r => num(r.doneDays)));

  const apiSlack =
    !oos.signoff && feContract && plan.desiredApiDoc
      ? diffWkd(feContract, plan.desiredApiDoc)
      : null;
  const readySlack =
    !oos.ready && feReady && plan.desiredReady ? diffWkd(feReady, plan.desiredReady) : null;
  const doneSlack =
    !oos.done && projectDone && plan.studioDeadline
      ? diffWkd(projectDone, plan.studioDeadline)
      : null;

  const canJudge =
    (oos.signoff || apiSlack !== null) &&
    (oos.ready || readySlack !== null) &&
    (oos.done || doneSlack !== null);
  const accepted =
    canJudge &&
    (oos.signoff || apiSlack >= 0) &&
    (oos.ready || readySlack >= 0) &&
    (oos.done || doneSlack >= 0);

  const problems = [];
  if (!oos.signoff && apiSlack !== null && apiSlack < 0)
    problems.push(`trễ mốc API Doc ${-apiSlack} ngày`);
  if (!oos.ready && readySlack !== null && readySlack < 0)
    problems.push(`trễ mốc Integration mong muốn ${-readySlack} ngày`);
  if (!oos.done && doneSlack !== null && doneSlack < 0)
    problems.push(`trễ Deadline Studio ${-doneSlack} ngày`);

  const setDays = (id, field) => e =>
    setRow(id, field, e.target.value === '' ? '' : num(e.target.value));

  if (loading) {
    return (
      <div className="app">
        <div className="card">
          <p className="loading">Đang tải dữ liệu dự án…</p>
        </div>
      </div>
    );
  }

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
          <span className="game-pill">🎮 {plan.gameName || projectName}</span>
          <button className="btn-reset" onClick={() => navigate('/')}>
            ← Chọn dự án khác
          </button>
          <button className="btn-reset" onClick={() => setPlan(defaultPlan(projectName))}>
            Reset mặc định
          </button>
        </div>
      </header>

      <section className="card chart-card">
        <h2>Timeline</h2>
        <Gantt
          plan={plan}
          rows={rows}
          feContract={feContract}
          feReady={feReady}
          projectDone={projectDone}
        />
      </section>

      <section className="top-grid">
        <div className="card studio-card">
          <h2>Studio</h2>
          <p className="card-note">Yêu cầu từ phía Studio / khách hàng — hiện trên biểu đồ dưới dạng nhãn tím</p>
          <div className="studio-grid">
            <label className="field">
              <span>Project / Game Name</span>
              <input
                type="text"
                value={plan.gameName}
                placeholder="Tên dự án / game"
                onChange={e => set('gameName', e.target.value)}
              />
            </label>
            <label className="field">
              <span>KickOff Date (Mốc 1)</span>
              <input type="date" value={plan.startDate} onChange={e => set('startDate', e.target.value)} />
            </label>
            <label className="field">
              <span>SignOff API mong muốn (nhận API Documentation)</span>
              <input type="date" value={plan.desiredApiDoc} onChange={e => set('desiredApiDoc', e.target.value)} />
            </label>
            <label className="field">
              <span>Ngày mong muốn Integration được (M3 mong muốn)</span>
              <input type="date" value={plan.desiredReady} onChange={e => set('desiredReady', e.target.value)} />
            </label>
            <label className="field">
              <span>Deadline từ Studio</span>
              <input type="date" value={plan.studioDeadline} onChange={e => set('studioDeadline', e.target.value)} />
            </label>
            <label className="field">
              <span>PIC Studio</span>
              <input
                type="text"
                value={plan.pic}
                placeholder="Tên người đại diện Studio"
                onChange={e => set('pic', e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="card be-card">
          <h2>Backend đáp ứng</h2>
          <p className="card-note">= MAX từng mốc của {rows.length} team trong bảng dưới — nhãn trắng trên biểu đồ</p>

          <div className="be-row">
            <i className="be-dot dot-contract" />
            <span className="be-label">SignOff API (Mốc 2)</span>
            <span className="be-date">{oos.signoff ? 'Ngoài scope' : fmtFull(feContract)}</span>
            {oos.signoff ? (
              <span className="delta delta-muted">không đánh giá</span>
            ) : (
              <SlackBadge slack={apiSlack} targetLabel="mốc mong muốn" />
            )}
          </div>
          <div className="be-row">
            <i className="be-dot dot-dev" />
            <span className="be-label">Ready Integration (Mốc 3)</span>
            <span className="be-date">{oos.ready ? 'Ngoài scope' : fmtFull(feReady)}</span>
            {oos.ready ? (
              <span className="delta delta-muted">không đánh giá</span>
            ) : (
              <SlackBadge slack={readySlack} targetLabel="mốc Integration mong muốn" />
            )}
          </div>
          <div className="be-row">
            <i className="be-dot dot-enddev" />
            <span className="be-label">Development Done (Mốc 4)</span>
            <span className="be-date">{oos.done ? 'Ngoài scope' : fmtFull(projectDone)}</span>
            {oos.done ? (
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
                    oos.done
                      ? 'API Doc & Integration đúng hẹn (Development Done ngoài scope)'
                      : 'đáp ứng cả mốc API Doc, Integration mong muốn & Deadline Studio'
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
              <th>
                SignOff API<span className="th-sub">số ngày từ KickOff</span>
                <label className="oos-toggle">
                  <input
                    type="checkbox"
                    checked={oos.signoff}
                    onChange={e => set('oos', { ...oos, signoff: e.target.checked })}
                  />
                  ngoài scope
                </label>
              </th>
              <th>
                Ready Integration<span className="th-sub">số ngày từ SignOff API (MAX)</span>
                <label className="oos-toggle">
                  <input
                    type="checkbox"
                    checked={oos.ready}
                    onChange={e => set('oos', { ...oos, ready: e.target.checked })}
                  />
                  ngoài scope
                </label>
              </th>
              <th>
                Development Done
                <span className="th-sub">số ngày từ Ready Integration</span>
                <label className="oos-toggle">
                  <input
                    type="checkbox"
                    checked={oos.done}
                    onChange={e => set('oos', { ...oos, done: e.target.checked })}
                  />
                  ngoài scope
                </label>
              </th>
              <th className="th-noe">NOE</th>
              <th className="th-del" />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
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
                  <div className="days-cell">
                    <input
                      className="cell-input cell-days"
                      type="number"
                      min="0"
                      step="1"
                      value={r.contractDays}
                      onChange={setDays(r.id, 'contractDays')}
                    />
                    <span className="days-unit">ngày</span>
                    <span className="days-date">→ {fmtFull(r.contract)}</span>
                  </div>
                </td>
                <td>
                  <div className="days-cell">
                    <input
                      className="cell-input cell-days"
                      type="number"
                      min="0"
                      step="1"
                      value={r.readyDays}
                      onChange={setDays(r.id, 'readyDays')}
                    />
                    <span className="days-unit">ngày</span>
                    <span className="days-date">→ {fmtFull(r.ready)}</span>
                  </div>
                </td>
                <td>
                  <div className="days-cell">
                    <input
                      className="cell-input cell-days"
                      type="number"
                      min="0"
                      step="1"
                      value={r.doneDays}
                      disabled={oos.done}
                      onChange={setDays(r.id, 'doneDays')}
                    />
                    <span className="days-unit">ngày</span>
                    <span className="days-date">→ {fmtFull(r.done)}</span>
                  </div>
                </td>
                <td className="td-noe">
                  <label className="noe-toggle">
                    <input
                      type="checkbox"
                      checked={r.noe}
                      onChange={e => setRow(r.id, 'noe', e.target.checked)}
                    />
                    <span className="noe-label">{r.noe ? 'YES' : 'NO'}</span>
                  </label>
                </td>
                <td className="td-del">
                  {rows.length > 1 && (
                    <button className="btn-del" title={`Xoá ${r.name}`} onClick={() => removeTeam(r.id)}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr className="total-row">
              <td>MAX (quyết định)</td>
              <td>
                <span className="days-cell">
                  <span className="days-max">{maxContractDays} ngày</span>
                  <span className="days-date">→ {fmtFull(feContract)}</span>
                </span>
              </td>
              <td>
                <span className="days-cell">
                  <span className="days-max">{maxReadyDays} ngày</span>
                  <span className="days-date">→ {fmtFull(feReady)}</span>
                </span>
              </td>
              <td>
                {oos.done ? (
                  '—'
                ) : (
                  <span className="days-cell">
                    <span className="days-max">{maxDoneDays} ngày</span>
                    <span className="days-date">→ {fmtFull(projectDone)}</span>
                  </span>
                )}
              </td>
              <td className="td-noe" />
              <td className="td-del" />
            </tr>
          </tbody>
        </table>
        <button className="btn-add" onClick={addTeam}>
          + Thêm team
        </button>
        <p className="logic-note">
          Sửa trực tiếp trong bảng — panel Backend &amp; biểu đồ phía trên cập nhật ngay. Cả 3 cột
          đều nhập <b>số ngày làm việc</b>: SignOff API tính từ KickOff, Ready Integration tính từ
          MAX(SignOff API), Development Done tính từ Ready Integration. Ngày tuyệt đối suy ra hiển
          thị bên cạnh. Mỗi mốc của Backend = ngày muộn nhất (MAX) của tất cả team.
        </p>
      </section>
    </div>
  );
}
