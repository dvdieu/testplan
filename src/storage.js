import { getPlan as getRemotePlan, listProjects as listRemoteProjects, savePlan as saveRemotePlan } from './api.js';

const KV_ENABLED = import.meta.env.VITE_KV_ENABLED !== 'false';
const LS_PROJECTS_KEY = 'integration-planner-projects';

export async function listProjects() {
  if (KV_ENABLED) {
    try {
      const { projects } = await listRemoteProjects();
      return projects;
    } catch (err) {
      console.warn('KV list failed, falling back to localStorage', err);
    }
  }
  try {
    const raw = localStorage.getItem(LS_PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function loadPlan(name) {
  if (KV_ENABLED) {
    try {
      return await getRemotePlan(name);
    } catch (err) {
      console.warn('KV get failed, falling back to localStorage', err);
    }
  }
  try {
    const raw = localStorage.getItem(`integration-planner-${name}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function savePlan(name, plan) {
  const projects = new Set(await listProjects());
  projects.add(name);

  if (KV_ENABLED) {
    try {
      await saveRemotePlan(name, plan);
      // sync project list locally as fallback cache
      localStorage.setItem(LS_PROJECTS_KEY, JSON.stringify([...projects]));
      return;
    } catch (err) {
      console.warn('KV save failed, falling back to localStorage', err);
    }
  }
  localStorage.setItem(`integration-planner-${name}`, JSON.stringify(plan));
  localStorage.setItem(LS_PROJECTS_KEY, JSON.stringify([...projects]));
}
