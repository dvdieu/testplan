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
  // localStorage fallback: danh sách lưu dạng mảng TÊN (string). IndexPage cần OBJECT
  // (name, gameName, ngày…) → đọc plan mỗi dự án dựng object tóm tắt. Tránh crash slugify.
  try {
    const raw = localStorage.getItem(LS_PROJECTS_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    return entries
      .map(entry => {
        const name = typeof entry === 'string' ? entry : entry && entry.name;
        if (!name) return null;
        let plan = null;
        try {
          const container = JSON.parse(localStorage.getItem(`integration-planner-${name}`) || '{}');
          // container theo phase (engine/support/cheat); lấy phase đầu có dữ liệu
          plan = PHASES.map(ph => container[ph]).find(Boolean) || null;
        } catch {
          /* plan hỏng → để trống */
        }
        return {
          name,
          gameName: (plan && plan.gameName) || '',
          startDate: (plan && plan.startDate) || '',
          desiredApiDoc: (plan && plan.desiredApiDoc) || '',
          desiredReady: (plan && plan.desiredReady) || '',
          studioDeadline: (plan && plan.studioDeadline) || '',
          pic: (plan && plan.pic) || '',
          noe: !!(plan && plan.noe),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function loadPlan(name, phase) {
  if (KV_ENABLED) {
    try {
      // getRemotePlan ĐÃ trả CONTAINER {engine,support,cheat} (hoặc null nếu chưa có). KHÔNG destructure .plan.
      const container = await getRemotePlan(name);
      if (container) return container[phase] || null;
      // container null = dự án chưa trên KV → thử localStorage (migrate dữ liệu cũ) rồi thôi.
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
  // listProjects() trả OBJECT tóm tắt → rút TÊN để index luôn là mảng string thuần.
  const existing = await listProjects();
  const projects = new Set(
    existing.map(p => (typeof p === 'string' ? p : p && p.name)).filter(Boolean),
  );
  projects.add(name);

  if (KV_ENABLED) {
    try {
      // GET container cũ để merge phase khác — BEST-EFFORT: lỗi/404 KHÔNG chặn PUT (nếu không dự án
      // mới không bao giờ vào KV → rơi localStorage mãi). getRemotePlan trả container thẳng, KHÔNG .plan.
      let container = {};
      try {
        container = (await getRemotePlan(name)) || {};
      } catch (err) {
        console.warn('KV get before save failed, writing fresh container', err);
      }
      container[phase] = plan;
      await saveRemotePlan(name, container); // PUT = nguồn ghi chính vào KV
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
