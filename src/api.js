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

export async function getPlan(name) {
  const { plan } = await fetchJson(`/api/projects/${encodeURIComponent(name)}`);
  return plan;
}

export async function savePlan(name, plan) {
  return fetchJson('/api/projects', {
    method: 'PUT',
    body: JSON.stringify({ name, plan }),
  });
}
