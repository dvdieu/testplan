import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtFull } from './date.js';
import { listProjects } from './storage.js';

export default function IndexPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  const enterProject = projectName => {
    // Danh tính = tên chính xác (không hạ chữ). encodeURIComponent lo phần URL-safe.
    // Trước đây slugify hạ "DemoGame"→"demogame" → PlannerPage load nhầm key → seed trùng.
    const clean = String(projectName || '').trim();
    if (!clean) return;
    navigate(`/plan/${encodeURIComponent(clean)}`);
  };

  const handleSubmit = e => {
    e.preventDefault();
    enterProject(name.trim());
  };

  return (
    <div className="app index-page">
      <div className="index-card card">
        <h1>Integration Planner</h1>
        <p className="subtitle">
          Lập timeline Backend đáp ứng mốc API Doc &amp; Deadline Studio theo từng dự án.
        </p>

        <form onSubmit={handleSubmit} className="index-form">
          <label className="field">
            <span>Tên dự án</span>
            <input
              type="text"
              value={name}
              placeholder="Nhập tên dự án / game"
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </label>
          <button type="submit" className="btn-primary" disabled={!name.trim()}>
            Vào planner →
          </button>
        </form>

        {loading ? (
          <p className="recent-loading">Đang tải danh sách dự án…</p>
        ) : projects.length > 0 ? (
          <div className="recent-projects">
            <h3>Danh sách dự án</h3>
            <div className="table-wrap">
              <table className="project-table summary-table">
                <thead>
                  <tr>
                    <th>Dự án</th>
                    <th>Game</th>
                    <th>KickOff</th>
                    <th>SignOff API mong muốn</th>
                    <th>Integration mong muốn</th>
                    <th>Deadline Studio</th>
                    <th>PIC Studio</th>
                    <th>NOE</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((raw, i) => {
                    // Chấp nhận cả string (tên) lẫn object — không để entry hỏng làm trắng trang
                    const p = typeof raw === 'string' ? { name: raw } : raw || {};
                    return (
                    <tr
                      key={`${p.name || 'proj'}-${i}`}
                      className="project-row"
                      onClick={() => enterProject(p.name)}
                    >
                      <td className="project-name">{p.name || '—'}</td>
                      <td>{p.gameName || '—'}</td>
                      <td>{fmtFull(p.startDate)}</td>
                      <td>{fmtFull(p.desiredApiDoc)}</td>
                      <td>{fmtFull(p.desiredReady)}</td>
                      <td className="project-deadline">{fmtFull(p.studioDeadline)}</td>
                      <td>{p.pic || '—'}</td>
                      <td className="project-noe">{p.noe ? 'YES' : 'NO'}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
