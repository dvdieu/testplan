import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listProjects } from './storage.js';

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

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
    const slug = slugify(projectName);
    if (!slug) return;
    navigate(`/plan/${encodeURIComponent(slug)}`, { state: { projectName } });
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
            <h3>Dự án gần đây</h3>
            <ul>
              {projects.map(p => (
                <li key={slugify(p)}>
                  <button className="btn-link" onClick={() => enterProject(p)}>
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
