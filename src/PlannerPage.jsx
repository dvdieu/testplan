import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Gantt from './Gantt.jsx';
import { loadPlan, savePlan } from './storage.js';
import { PHASES, phaseDesiredLabel, phaseItemLabel, phaseLabel } from './phase.js';
import { computeBackend, defaultPlan, hydratePlan, MS_STATUSES, MS_TYPES } from './model.js';
import { todayStr } from './date.js';

export default function PlannerPage() {
  const { projectName } = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('engine');
  const [plan, setPlan] = useState(() => defaultPlan(projectName, phase));
  const [loading, setLoading] = useState(true);
  // Thu gọn từng section → nhường chiều cao cho Gantt (tâm điểm). Mặc định mở.
  const [collapsed, setCollapsed] = useState({});
  const toggle = key => setCollapsed(c => ({ ...c, [key]: !c[key] }));

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

  // Nút "Lưu" thủ công: ghi KV ngay + phản hồi rõ ("Đã lưu ✓"). App vẫn auto-save nền mỗi lần sửa,
  // nút này cho người dùng chủ động lưu + thấy chắc chắn đã ghi.
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved
  const saveNow = async () => {
    setSaveState('saving');
    try {
      await savePlan(projectName, phase, plan);
      setSaveState('saved');
    } catch {
      setSaveState('idle');
    }
  };
  useEffect(() => {
    if (saveState !== 'saved') return undefined;
    const t = setTimeout(() => setSaveState('idle'), 1800);
    return () => clearTimeout(t);
  }, [saveState]);

  // ---- mutations ----
  const set = (field, value) => setPlan(p => ({ ...p, [field]: value }));
  const setRow = (id, field, value) =>
    setPlan(p => ({ ...p, rows: p.rows.map(r => (r.id === id ? { ...r, [field]: value } : r)) }));
  const addTeam = () =>
    setPlan(p => {
      const roots = p.rows.filter(r => !r.parentId).length;
      const row = p.template === 'wbs'
        ? { id: crypto.randomUUID(), name: `Sum ${roots + 1}`, wkd: 3 } // Sum gốc mới (tuần tự sau Sum trước)
        : { id: crypto.randomUUID(), name: `Team ${p.rows.length + 1}`, contractDays: 2, readyDays: 2, doneDays: 3 };
      return { ...p, rows: [...p.rows, row] };
    });
  const addChild = parentId =>
    setPlan(p => {
      const parentIndex = p.rows.findIndex(r => r.id === parentId);
      if (parentIndex === -1) return p;
      const siblings = p.rows.filter(r => r.parentId === parentId);
      const newRow = p.template === 'wbs'
        ? { id: crypto.randomUUID(), parentId, name: `Task ${siblings.length + 1}`, wkd: 2 } // lá WBS (parent thành nhóm, bao theo con)
        : { id: crypto.randomUUID(), parentId, name: `Task ${siblings.length + 1}`, contractDays: 1, readyDays: 1, doneDays: 1 };
      const rows = [...p.rows];
      rows.splice(parentIndex + siblings.length + 1, 0, newRow);
      return { ...p, rows };
    });
  const removeTeam = id =>
    setPlan(p => {
      const target = p.rows.find(r => r.id === id);
      if (!target) return p;
      const roots = p.rows.filter(r => !r.parentId);
      if (!target.parentId && roots.length <= 1) return p; // giữ tối thiểu 1 nhóm gốc
      const idsToRemove = new Set();
      const collect = x => { // xoá đệ quy cả cây con (WBS sâu 2 cấp: Sum→Task→việc con)
        idsToRemove.add(x);
        p.rows.forEach(r => { if (r.parentId === x) collect(r.id); });
      };
      collect(id);
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
  const backend = computeBackend(plan);

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
          <button
            className={`btn-save${saveState === 'saved' ? ' is-saved' : ''}`}
            onClick={saveNow}
            disabled={saveState === 'saving'}
          >
            {saveState === 'saving' ? 'Đang lưu…' : saveState === 'saved' ? 'Đã lưu ✓' : '💾 Lưu'}
          </button>
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

      <section className="top-solo">
        <div className={`card studio-card${collapsed.studio ? ' is-collapsed' : ''}`}>
          <div className="card-head" onClick={() => toggle('studio')} role="button" tabIndex={0}>
            <button type="button" className="card-collapse" aria-expanded={!collapsed.studio} aria-label="Thu gọn / mở">{collapsed.studio ? '▸' : '▾'}</button>
            <h2>Studio</h2>
          </div>
          <div className="card-body">
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
            <label className="field noe-field">
              <span>JP</span>
              <label className="noe-toggle noe-studio">
                <input type="checkbox" checked={plan.jp} onChange={e => set('jp', e.target.checked)} />
                <span className="noe-label">{plan.jp ? 'YES' : 'NO'}</span>
              </label>
            </label>
            <label className="field noe-field">
              <span>CERT</span>
              <label className="noe-toggle noe-studio">
                <input type="checkbox" checked={plan.cert} onChange={e => set('cert', e.target.checked)} />
                <span className="noe-label">{plan.cert ? 'YES' : 'NO'}</span>
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

        <p className="logic-note">
          Sửa trực tiếp trong lưới: <b>Task Name</b> (đổi tên team), <b>WKD</b> (số ngày làm việc mỗi phase — bỏ cuối tuần).
          Nút <b>New task</b> trên thanh công cụ để thêm; <b>chuột phải</b> → <b>Delete</b> để xoá; caret ▸ <b>ẩn/hiện</b> nhóm.
          Nhãn tím = mốc Studio mong muốn; nhãn trắng = kế hoạch BE thực tế (ngày muộn nhất — MAX — của mọi team &amp; task con).
        </p>
      </section>
    </div>
  );
}
