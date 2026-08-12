import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Gantt from './Gantt.jsx';
import { loadPlan, savePlan } from './storage.js';
import { PHASES, phaseDesiredLabel, phaseItemLabel, phaseLabel } from './phase.js';
import { computeBackend, defaultPlan, hydratePlan, MS_STATUSES, MS_TYPES } from './model.js';
import { fmtFull, todayStr } from './date.js';

function SlackBadge({ slack, targetLabel }) {
  if (slack === null) return <span className="delta delta-muted">Chưa đủ dữ liệu</span>;
  if (slack > 0) return <span className="delta delta-ok">✓ Sớm hơn {targetLabel} {slack} ngày</span>;
  if (slack === 0) return <span className="delta delta-ok">✓ Đúng {targetLabel}</span>;
  return <span className="delta delta-bad">✕ Trễ {targetLabel} {-slack} ngày</span>;
}

export default function PlannerPage() {
  const { projectName } = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('engine');
  const [plan, setPlan] = useState(() => defaultPlan(projectName, phase));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadPlan(projectName, phase).then(remote => {
      setPlan(hydratePlan(remote, projectName, phase));
      setLoading(false);
    });
  }, [projectName, phase]);

  useEffect(() => {
    if (!loading) savePlan(projectName, phase, plan);
  }, [plan, projectName, phase, loading]);

  // ---- mutations ----
  const set = (field, value) => setPlan(p => ({ ...p, [field]: value }));
  const setRow = (id, field, value) =>
    setPlan(p => ({ ...p, rows: p.rows.map(r => (r.id === id ? { ...r, [field]: value } : r)) }));
  const addTeam = () =>
    setPlan(p => ({
      ...p,
      rows: [...p.rows, { id: crypto.randomUUID(), name: `Team ${p.rows.length + 1}`, contractDays: 2, readyDays: 2, doneDays: 3 }],
    }));
  const addChild = parentId =>
    setPlan(p => {
      const parentIndex = p.rows.findIndex(r => r.id === parentId);
      if (parentIndex === -1) return p;
      const siblings = p.rows.filter(r => r.parentId === parentId);
      const newRow = { id: crypto.randomUUID(), parentId, name: `Task ${siblings.length + 1}`, contractDays: 1, readyDays: 1, doneDays: 1 };
      const rows = [...p.rows];
      rows.splice(parentIndex + siblings.length + 1, 0, newRow);
      return { ...p, rows };
    });
  const removeTeam = id =>
    setPlan(p => {
      const target = p.rows.find(r => r.id === id);
      if (!target) return p;
      const roots = p.rows.filter(r => !r.parentId);
      if (!target.parentId && roots.length <= 1) return p; // giữ tối thiểu 1 team gốc
      const idsToRemove = new Set([id]);
      p.rows.forEach(r => {
        if (r.parentId === id) idsToRemove.add(r.id); // xoá cả task con
      });
      return { ...p, rows: p.rows.filter(r => !idsToRemove.has(r.id)) };
    });

  const setMilestone = (id, field, value) =>
    setPlan(p => ({
      ...p,
      milestones: (p.milestones || []).map(m => {
        if (m.id !== id) return m;
        if (m.hard && field === 'type') return m; // Loại khoá cho mốc hard code
        return { ...m, [field]: value };
      }),
    }));
  const addMilestone = () =>
    setPlan(p => ({
      ...p,
      milestones: [...(p.milestones || []), { id: crypto.randomUUID(), type: 'BE-GAME', status: 'READY', date: p.startDate || todayStr() }],
    }));
  const removeMilestone = id => setPlan(p => ({ ...p, milestones: (p.milestones || []).filter(m => m.id !== id) }));

  // ---- derived ----
  const itemLabel = phaseItemLabel(phase);
  const desiredLabel = phaseDesiredLabel(phase);
  const { oos } = plan;
  const backend = computeBackend(plan);
  const { feContract, feReady, projectDone, apiSlack, readySlack, doneSlack, canJudge, accepted } = backend;

  const problems = [];
  if (!oos.signoff && apiSlack !== null && apiSlack < 0) problems.push(`trễ mốc ${itemLabel} ${-apiSlack} ngày`);
  if (!oos.ready && readySlack !== null && readySlack < 0) problems.push(`trễ mốc Integration mong muốn ${-readySlack} ngày`);
  if (!oos.done && doneSlack !== null && doneSlack < 0) problems.push(`trễ Deadline Studio ${-doneSlack} ngày`);

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
          <p className="subtitle">Timeline Backend có đáp ứng mốc nhận API Doc &amp; Deadline của Studio không?</p>
        </div>
        <div className="header-right">
          <span className="game-pill">🎮 {plan.gameName || projectName}</span>
          <button className="btn-reset" onClick={() => navigate('/')}>← Chọn dự án khác</button>
          <button className="btn-reset" onClick={() => setPlan(defaultPlan(projectName, phase))}>Reset mặc định</button>
        </div>
      </header>

      <div className="phase-tabs">
        {PHASES.map(p => (
          <button key={p} className={`phase-tab ${p === phase ? 'active' : ''}`} onClick={() => setPhase(p)}>
            {phaseLabel(p)}
          </button>
        ))}
      </div>

      <section className="top-grid">
        <div className="card studio-card">
          <h2>Studio</h2>
          <p className="card-note">Yêu cầu từ phía Studio / khách hàng — hiện trên biểu đồ dưới dạng nhãn tím</p>
          <div className="studio-grid">
            <label className="field">
              <span>Project / Game Name</span>
              <input type="text" value={plan.gameName} placeholder="Tên dự án / game" onChange={e => set('gameName', e.target.value)} />
            </label>
            <label className="field">
              <span>KickOff Date (Mốc 1)</span>
              <input type="date" value={plan.startDate} onChange={e => set('startDate', e.target.value)} />
            </label>
            <label className="field">
              <span>Deadline từ Studio</span>
              <input type="date" value={plan.studioDeadline} onChange={e => set('studioDeadline', e.target.value)} />
            </label>
            <label className="field">
              <span>PIC Studio</span>
              <input type="text" value={plan.pic} placeholder="Tên người đại diện Studio" onChange={e => set('pic', e.target.value)} />
            </label>
            <label className="field noe-field">
              <span>NOE (New Owner Estimate)</span>
              <label className="noe-toggle noe-studio">
                <input type="checkbox" checked={plan.noe} onChange={e => set('noe', e.target.checked)} />
                <span className="noe-label">{plan.noe ? 'YES' : 'NO'}</span>
              </label>
            </label>
          </div>

          <div className="ms-editor">
            <div className="ms-editor-head">
              <span className="ms-editor-title">🎯 Mốc Studio mong muốn — Loại · Status · Ngày</span>
              <button className="btn-add-child" onClick={addMilestone}>+ Thêm mốc</button>
            </div>
            <div className="ms-rows">
              {(plan.milestones || []).map(m => (
                <div className={`ms-row${m.hard ? ' ms-row-hard' : ''}`} key={m.id}>
                  {m.hard ? (
                    <span className="ms-type ms-type-hard" title="Mốc cố định — hard code">🔒 {m.type}</span>
                  ) : (
                    <input className="ms-type" list="ms-types" value={m.type} placeholder="Loại" onChange={e => setMilestone(m.id, 'type', e.target.value)} />
                  )}
                  <select className="ms-status" value={m.status} onChange={e => setMilestone(m.id, 'status', e.target.value)}>
                    {MS_STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <input className="ms-date" type="date" value={m.date || ''} onChange={e => setMilestone(m.id, 'date', e.target.value)} />
                  <button className="btn-del" title="Xoá mốc" onClick={() => removeMilestone(m.id)}>×</button>
                </div>
              ))}
            </div>
            <datalist id="ms-types">
              {MS_TYPES.map(t => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="card be-card">
          <h2>Backend đáp ứng</h2>
          <p className="card-note">= MAX từng mốc của {backend.rows.length} team trong biểu đồ dưới — bar màu trên timeline</p>

          <div className="be-row">
            <i className="be-dot dot-contract" />
            <span className="be-label">{itemLabel} (Mốc 2)</span>
            <span className="be-date">{oos.signoff ? 'Ngoài scope' : fmtFull(feContract)}</span>
            {oos.signoff ? <span className="delta delta-muted">không đánh giá</span> : <SlackBadge slack={apiSlack} targetLabel={desiredLabel} />}
            <label className="oos-mini">
              <input type="checkbox" checked={oos.signoff} onChange={e => set('oos', { ...oos, signoff: e.target.checked })} />
              ngoài scope
            </label>
          </div>
          <div className="be-row">
            <i className="be-dot dot-dev" />
            <span className="be-label">Ready Integration (Mốc 3)</span>
            <span className="be-date">{oos.ready ? 'Ngoài scope' : fmtFull(feReady)}</span>
            {oos.ready ? <span className="delta delta-muted">không đánh giá</span> : <SlackBadge slack={readySlack} targetLabel="mốc Integration mong muốn" />}
            <label className="oos-mini">
              <input type="checkbox" checked={oos.ready} onChange={e => set('oos', { ...oos, ready: e.target.checked })} />
              ngoài scope
            </label>
          </div>
          <div className="be-row">
            <i className="be-dot dot-enddev" />
            <span className="be-label">Development Done (Mốc 4)</span>
            <span className="be-date">{oos.done ? 'Ngoài scope' : fmtFull(projectDone)}</span>
            {oos.done ? <span className="delta delta-muted">không đánh giá</span> : <SlackBadge slack={doneSlack} targetLabel="Deadline Studio" />}
            <label className="oos-mini">
              <input type="checkbox" checked={oos.done} onChange={e => set('oos', { ...oos, done: e.target.checked })} />
              ngoài scope
            </label>
          </div>

          <div className={`be-verdict ${accepted ? 'verdict-ok' : 'verdict-bad'}`}>
            {!canJudge
              ? '— Nhập đủ ngày để đánh giá'
              : accepted
                ? `✓ Chấp nhận được — ${oos.done ? 'API Doc & Integration đúng hẹn (Development Done ngoài scope)' : 'đáp ứng cả mốc API Doc, Integration mong muốn & Deadline Studio'}`
                : `✕ Không đạt — BE ${problems.join(', ')}, cần đàm phán lại plan`}
          </div>
        </div>
      </section>

      <section className="card chart-card">
        <div className="chart-head">
          <h2>Lịch Backend — sửa trực tiếp Task Name / WKD trong lưới</h2>
        </div>

        <Gantt
          plan={plan}
          backend={backend}
          itemLabel={itemLabel}
          desiredLabel={desiredLabel}
          setRow={setRow}
          addChild={addChild}
          addTeam={addTeam}
          removeTeam={removeTeam}
          setField={set}
          setMilestone={setMilestone}
          removeMilestone={removeMilestone}
        />

        <div className="team-manager">
          <div className="tm-group">
            <span className="team-manager-label">Xoá team:</span>
            {plan.rows.filter(r => !r.parentId).map(r => (
              <button
                key={r.id}
                className="btn-del-team"
                title={`Xoá ${r.name || 'team'}`}
                onClick={() => removeTeam(r.id)}
              >
                {r.name || 'Team ?'} ×
              </button>
            ))}
          </div>
          {plan.rows.some(r => r.parentId) && (
            <div className="tm-group">
              <span className="team-manager-label">Xoá task con:</span>
              {plan.rows.filter(r => r.parentId).map(r => {
                const parent = plan.rows.find(p => p.id === r.parentId);
                return (
                  <button
                    key={r.id}
                    className="btn-del-team btn-del-sub"
                    title={`Xoá ${r.name || 'task'} thuộc ${parent?.name || 'team'}`}
                    onClick={() => removeTeam(r.id)}
                  >
                    {r.name || 'Task ?'} <span className="tm-parent">({parent?.name || '?'})</span> ×
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="logic-note">
          Sửa trực tiếp trong lưới: <b>Task Name</b> (đổi tên team), <b>WKD</b> (số ngày làm việc mỗi phase — bỏ cuối tuần).
          Nút <b>New task</b> trên thanh công cụ để thêm; <b>chuột phải</b> → <b>Delete</b> để xoá; caret ▸ <b>ẩn/hiện</b> nhóm.
          Nhãn tím = mốc Studio mong muốn; nhãn trắng = kế hoạch BE thực tế (ngày muộn nhất — MAX — của mọi team &amp; task con).
        </p>
      </section>
    </div>
  );
}
