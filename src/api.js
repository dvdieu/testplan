const API_BASE = import.meta.env.VITE_API_BASE || '';

const CORS = {
  'Content-Type': 'application/json',
};

async function fetchJson(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...CORS, ...options.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export async function listProjects() {
  return fetchJson('/api/projects');
}

// Trả CONTAINER plan ({engine,support,cheat}) hoặc null nếu dự án CHƯA có trên KV.
// 404 = chưa có → null (KHÔNG throw) để savePlan vẫn PUT tạo mới, không rơi về localStorage.
export async function getPlan(name) {
  const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(name)}`, { headers: CORS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  const { plan } = await res.json();
  return plan;
}

export async function savePlan(name, plan) {
  return fetchJson('/api/projects', {
    method: 'PUT',
    body: JSON.stringify({ name, plan }),
  });
}
