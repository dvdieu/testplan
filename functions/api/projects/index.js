const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ env }) {
  try {
    const list = await env.PLANS.list({ prefix: 'plan:' });
    const projects = await Promise.all(
      list.keys.map(async k => {
        const name = k.name.replace(/^plan:/, '');
        const raw = await env.PLANS.get(k.name);
        const plan = raw ? JSON.parse(raw) : {};
        return {
          name,
          gameName: plan.gameName || '',
          studioDeadline: plan.studioDeadline || '',
          pic: plan.pic || '',
        };
      }),
    );
    return json({ projects });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const { name, plan } = await request.json();
    if (!name || typeof plan !== 'object') {
      return json({ error: 'Missing name or plan' }, 400);
    }
    await env.PLANS.put(`plan:${name}`, JSON.stringify(plan));
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
