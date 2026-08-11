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

export async function onRequestGet({ env, params }) {
  try {
    const value = await env.PLANS.get(`plan:${params.name}`);
    if (!value) return json({ plan: null }, 404);
    return json({ plan: JSON.parse(value) });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestPut({ request, env, params }) {
  try {
    const plan = await request.json();
    await env.PLANS.put(`plan:${params.name}`, JSON.stringify(plan));
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
