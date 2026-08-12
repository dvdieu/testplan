import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SvarGantt from './SvarGantt.jsx';
import { loadPlan, savePlan } from './storage.js';
import { PHASES, phaseDesiredLabel, phaseItemLabel, phaseLabel } from './phase.js';
import {
  addWkdStr,
  diffWkd,
  fmtFull,
  fmtShort,
  maxDate,
  parseDate,
  todayStr,
} from './date.js';

const num = v => Math.max(0, Math.round(Number(v) || 0));

// Mốc Studio động: mỗi mốc = Loại (type) · Status · Ngày mong muốn.
// Loại (type): tự do, có gợi ý. Status: COMBOBOX cố định 4 giá trị dưới.
const MS_TYPES = ['API-CONTRACT', 'BE-GAME', 'Deploy BE', 'Tool-Cheat Game', 'Tool-Cheat Ví'];
const MS_STATUSES = [
  { value: 'SignOff', label: 'SignOff · Đã chốt' },
  { value: 'Smoke test', label: 'Smoke test' },
  { value: 'READY', label: 'READY' },
  { value: 'DONE', label: 'DONE' },
];
const MS_STATUS_VALUES = new Set(MS_STATUSES.map(s => s.value));
// Map status cũ (R4*) → enum mới khi nạp plan cũ
const LEGACY_STATUS = {
  R4Implementation: 'SignOff',
  R4Network: 'Smoke test',
  R4Integration: 'READY',
  R4QC: 'DONE',
  R4RTPPair: 'DONE',
};
const normStatus = s => (MS_STATUS_VALUES.has(s) ? s : LEGACY_STATUS[s] || 'READY');

// Bộ mốc mặc định theo yêu cầu Studio.
// Mốc API-CONTRACT = HARD CODE: luôn có, Loại khoá, không xoá được (chỉ sửa Status/Ngày).
const defaultMilestones = today => [
  { id: crypto.randomUUID(), type: 'API-CONTRACT', status: 'SignOff', date: addWkdStr(today, 7), hard: true },
  { id: crypto.randomUUID(), type: 'BE-GAME', status: 'Smoke test', date: addWkdStr(today, 12) },
  { id: crypto.randomUUID(), type: 'BE-GAME', status: 'READY', date: addWkdStr(today, 16) },
  { id: crypto.randomUUID(), type: 'BE-GAME', status: 'DONE', date: addWkdStr(today, 26) },
];

// Phase Backend ↔ mốc Studio: nếu chưa ghim (phaseMs) thì suy theo status/type
const PHASE_MS_RE = {
  contract: /signoff|contract|^api/i,
  dev: /ready|integration/i,
  done: /^done$|deploy|rtp/i,
};
const resolvePhaseMs = (plan, key) => {
  const list = plan.milestones || [];
  const pinnedId = plan.phaseMs && plan.phaseMs[key];
  const pinned = pinnedId && list.find(m => m.id === pinnedId);
  return (
    pinned ||
    list.find(m => PHASE_MS_RE[key].test(m.status || '') || PHASE_MS_RE[key].test(m.type || '')) ||
    null
  );
};

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
    return { ...rest, readyDays, doneDays };
  });
  return { ...plan, noe: plan.noe ?? false, rows };
}

function defaultPlan(projectName, phase) {
  const today = todayStr();
  const mk = (name, contractDays, readyDays, doneDays) => ({
    id: crypto.randomUUID(),
    name,
    contractDays,
    readyDays,
    doneDays,
  });
  return {
    projectName,
    phase,
    gameName: projectName,
    startDate: today,
    studioDeadline: addWkdStr(today, 30),
    pic: '',
    noe: false,
    milestones: defaultMilestones(today),
    oos: { signoff: false, ready: false, done: false },
    rows: [
      mk('Team Infra', 3, 2, 10),
      mk('Team BO', 5, 5, 12),
      mk('Team Platform', 6, 7, 14),
      mk('Team BE', 4, 3, 12),
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

async function loadPlanAsync(projectName, phase) {
  const remote = await loadPlan(projectName, phase);
  if (remote) {
    const base = { ...defaultPlan(projectName, phase), ...remote, oos: migrateOos(remote) };
    delete base.doneOutOfScope;
    // Plan cũ chưa có milestones động → seed từ mặc định
    if (!Array.isArray(base.milestones) || base.milestones.length === 0) {
      base.milestones = defaultMilestones(base.startDate || todayStr());
    }
    // Chuẩn hoá status cũ (R4*) về enum combobox mới
    base.milestones = base.milestones.map(m => ({ ...m, status: normStatus(m.status) }));
    // Nâng cấp mốc API-CONTRACT sẵn có → hard (Loại khoá). Không tự thêm lại nếu user đã xoá.
    if (!base.milestones.some(m => m.hard)) {
      const idx = base.milestones.findIndex(m => m.type === 'API-CONTRACT');
      if (idx >= 0) {
        base.milestones = base.milestones.map((m, i) => (i === idx ? { ...m, hard: true } : m));
      }
    }
    return migrateRows(base);
  }
  return defaultPlan(projectName, phase);
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
  const [phase, setPhase] = useState('engine');
  const [plan, setPlan] = useState(() => defaultPlan(projectName, phase));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    loadPlanAsync(projectName, phase).then(p => {
      setPlan(p);
      setLoading(false);
    });
  }, [projectName, phase]);

  useEffect(() => {
    if (!loading) savePlan(projectName, phase, plan);
  }, [plan, projectName, phase, loading]);

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
          contractDays: 2,
          readyDays: 2,
          doneDays: 3,
        },
      ],
    }));
  const addChild = parentId =>
    setPlan(p => {
      const parentIndex = p.rows.findIndex(r => r.id === parentId);
      if (parentIndex === -1) return p;
      const siblings = p.rows.filter(r => r.parentId === parentId);
      const newRow = {
        id: crypto.randomUUID(),
        parentId,
        name: `Task ${siblings.length + 1}`,
        contractDays: 1,
        readyDays: 1,
        doneDays: 1,
      };
      const rows = [...p.rows];
      rows.splice(parentIndex + siblings.length + 1, 0, newRow);
      return { ...p, rows };
    });
  const removeTeam = id =>
    setPlan(p => {
      const target = p.rows.find(r => r.id === id);
      if (!target) return p;
      // root row cannot be removed if it is the only root
      const roots = p.rows.filter(r => !r.parentId);
      if (!target.parentId && roots.length <= 1) return p;
      // remove the row and all its children
      const idsToRemove = new Set([id]);
      const collectChildren = parentId => {
        p.rows.forEach(r => {
          if (r.parentId === parentId) {
            idsToRemove.add(r.id);
            collectChildren(r.id);
          }
        });
      };
      collectChildren(id);
      return { ...p, rows: p.rows.filter(r => !idsToRemove.has(r.id)) };
    });

  // Mốc Studio động
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
      milestones: [
        ...(p.milestones || []),
        {
          id: crypto.randomUUID(),
          type: 'BE-GAME',
          status: 'READY',
          date: p.startDate || todayStr(),
        },
      ],
    }));
  const removeMilestone = id =>
    setPlan(p => ({ ...p, milestones: (p.milestones || []).filter(m => m.id !== id) }));
  // Ghim phase Backend → 1 mốc Studio (chọn ở cột Milestone trong biểu đồ)
  const setPhaseMs = (key, msId) =>
    setPlan(p => ({ ...p, phaseMs: { ...(p.phaseMs || {}), [key]: msId } }));

  const itemLabel = phaseItemLabel(phase);
  const desiredLabel = phaseDesiredLabel(phase);

  const { oos } = plan;
  const rows = resolveRows(plan);
  const feContract = maxDate(...rows.map(r => r.contract));
  const feReady = maxDate(...rows.map(r => r.ready));
  const projectDone = maxDate(...rows.map(r => r.done));

  // Mốc Studio động → options combo + mapping phase→mốc (chart & verdict dùng chung)
  const msList = plan.milestones || [];
  const msOptions = msList.map(m => ({
    id: m.id,
    label: `${m.type} · ${m.status} · ${fmtShort(m.date)}`,
  }));
  const phaseMsSel = {};
  const phaseMsLabel = {};
  ['contract', 'dev', 'done'].forEach(k => {
    const m = resolvePhaseMs(plan, k);
    phaseMsSel[k] = m ? m.id : '';
    phaseMsLabel[k] = m ? `${m.type} · ${m.status}` : '';
  });
  // Ngày Studio mong muốn cho verdict — theo mốc đã map cho phase contract / dev
  const effApiDoc = resolvePhaseMs(plan, 'contract')?.date;
  const effReady = resolvePhaseMs(plan, 'dev')?.date;

  const apiSlack =
    !oos.signoff && feContract && effApiDoc ? diffWkd(feContract, effApiDoc) : null;
  const readySlack =
    !oos.ready && feReady && effReady ? diffWkd(feReady, effReady) : null;
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
    problems.push(`trễ mốc ${itemLabel} ${-apiSlack} ngày`);
  if (!oos.ready && readySlack !== null && readySlack < 0)
    problems.push(`trễ mốc Integration mong muốn ${-readySlack} ngày`);
  if (!oos.done && doneSlack !== null && doneSlack < 0)
    problems.push(`trễ Deadline Studio ${-doneSlack} ngày`);

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
          <button className="btn-reset" onClick={() => setPlan(defaultPlan(projectName, phase))}>
            Reset mặc định
          </button>
        </div>
      </header>

      <div className="phase-tabs">
        {PHASES.map(p => (
          <button
            key={p}
            className={`phase-tab ${p === phase ? 'active' : ''}`}
            onClick={() => setPhase(p)}
          >
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
            <label className="field noe-field">
              <span>NOE (New Owner Estimate)</span>
              <label className="noe-toggle noe-studio">
                <input
                  type="checkbox"
                  checked={plan.noe}
                  onChange={e => set('noe', e.target.checked)}
                />
                <span className="noe-label">{plan.noe ? 'YES' : 'NO'}</span>
              </label>
            </label>
          </div>

          <div className="ms-editor">
            <div className="ms-editor-head">
              <span className="ms-editor-title">🎯 Mốc Studio mong muốn — Loại · Status · Ngày</span>
              <button className="btn-add-child" onClick={addMilestone}>
                + Thêm mốc
              </button>
            </div>
            <div className="ms-rows">
              {(plan.milestones || []).map(m => (
                <div className={`ms-row${m.hard ? ' ms-row-hard' : ''}`} key={m.id}>
                  {m.hard ? (
                    <span className="ms-type ms-type-hard" title="Mốc cố định — hard code">
                      🔒 {m.type}
                    </span>
                  ) : (
                    <input
                      className="ms-type"
                      list="ms-types"
                      value={m.type}
                      placeholder="Loại"
                      onChange={e => setMilestone(m.id, 'type', e.target.value)}
                    />
                  )}
                  <select
                    className="ms-status"
                    value={m.status}
                    onChange={e => setMilestone(m.id, 'status', e.target.value)}
                  >
                    {MS_STATUSES.map(s => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="ms-date"
                    type="date"
                    value={m.date || ''}
                    onChange={e => setMilestone(m.id, 'date', e.target.value)}
                  />
                  <button
                    className="btn-del"
                    title="Xoá mốc"
                    onClick={() => removeMilestone(m.id)}
                  >
                    ×
                  </button>
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
          <p className="card-note">= MAX từng mốc của {rows.length} team trong biểu đồ dưới — bar màu trên timeline</p>

          <div className="be-row">
            <i className="be-dot dot-contract" />
            <span className="be-label">{itemLabel} (Mốc 2)</span>
            <span className="be-date">{oos.signoff ? 'Ngoài scope' : fmtFull(feContract)}</span>
            {oos.signoff ? (
              <span className="delta delta-muted">không đánh giá</span>
            ) : (
              <SlackBadge slack={apiSlack} targetLabel={desiredLabel} />
            )}
            <label className="oos-mini">
              <input
                type="checkbox"
                checked={oos.signoff}
                onChange={e => set('oos', { ...oos, signoff: e.target.checked })}
              />
              ngoài scope
            </label>
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
            <label className="oos-mini">
              <input
                type="checkbox"
                checked={oos.ready}
                onChange={e => set('oos', { ...oos, ready: e.target.checked })}
              />
              ngoài scope
            </label>
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
            <label className="oos-mini">
              <input
                type="checkbox"
                checked={oos.done}
                onChange={e => set('oos', { ...oos, done: e.target.checked })}
              />
              ngoài scope
            </label>
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

      <section className="card chart-card">
        <div className="chart-head">
          <h2>Lịch Backend — sửa trực tiếp Task Name / Start / Duration trong lưới</h2>
          <button className="btn-add" onClick={addTeam}>
            + Thêm team
          </button>
        </div>
        <SvarGantt
          plan={plan}
          rows={rows}
          feContract={feContract}
          feReady={feReady}
          projectDone={projectDone}
          itemLabel={itemLabel}
          setRow={setRow}
          setField={set}
          addTeam={addTeam}
          addChild={addChild}
          removeTeam={removeTeam}
          msOptions={msOptions}
          phaseMsSel={phaseMsSel}
          phaseMsLabel={phaseMsLabel}
          setPhaseMs={setPhaseMs}
        />
        <p className="logic-note">
          Nhấp đúp ô để sửa: <b>Task Name</b> (đổi tên team), <b>Start</b> (đổi KickOff / Mốc 1),
          <b> Duration</b> (số ngày làm việc của từng phase). Caret ▸ để <b>ẩn/hiện</b> nhóm. Hàng
          <b> 🎯 Mốc Studio</b> (kim cương tím) là mốc mong muốn phía Studio. Mỗi mốc Backend = ngày
          muộn nhất (MAX) của mọi team &amp; task con. Dùng cột <b>＋</b> để thêm task con, phím
          <b> Delete</b> để xoá team.
        </p>
      </section>
    </div>
  );
}
