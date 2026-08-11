import { getPlan as getRemotePlan, listProjects as listRemoteProjects, savePlan as saveRemotePlan } from './api.js';

const KV_ENABLED = import.meta.env.VITE_KV_ENABLED !== 'false';
const LS_PROJECTS_KEY = 'integration-planner-projects';
const PHASES = ['engine', 'support', 'cheat'];

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

export async function loadPlan(name, phase) {
  if (KV_ENABLED) {
    try {
      const { plan: container } = await getRemotePlan(name);
      if (!container) return null;
      return container[phase] || null;
    } catch (err) {
      console.warn('KV get failed, falling back to localStorage', err);
    }
  }
  try {
    const raw = localStorage.getItem(`integration-planner-${name}`);
    if (!raw) return null;
    const container = JSON.parse(raw);
    return container[phase] || null;
  } catch {
    return null;
  }
}

export async function savePlan(name, phase, plan) {
  const projects = new Set(await listProjects());
  projects.add(name);

  if (KV_ENABLED) {
    try {
      const { plan: existingContainer } = await getRemotePlan(name);
      const container = existingContainer || {};
      container[phase] = plan;
      await saveRemotePlan(name, container);
      localStorage.setItem(LS_PROJECTS_KEY, JSON.stringify([...projects]));
      return;
    } catch (err) {
      console.warn('KV save failed, falling back to localStorage', err);
    }
  }
  try {
    const raw = localStorage.getItem(`integration-planner-${name}`);
    const container = raw ? JSON.parse(raw) : {};
    container[phase] = plan;
    localStorage.setItem(`integration-planner-${name}`, JSON.stringify(container));
    localStorage.setItem(LS_PROJECTS_KEY, JSON.stringify([...projects]));
  } catch (err) {
    console.error('Save plan failed', err);
  }
}
