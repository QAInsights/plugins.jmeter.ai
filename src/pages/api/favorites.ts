import type { APIRoute } from 'astro';

export const prerender = false;

interface FavRequestBody {
  pluginId?: string;
  pluginIds?: string[];
}

function getDatabase(locals: App.Locals) {
  return (locals.runtime?.env as any)?.DB;
}

export const GET: APIRoute = async ({ locals }) => {
  const auth = locals.auth ? locals.auth() : null;
  const userId = auth?.userId;

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized', favorites: [] }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = getDatabase(locals);
  if (!db) {
    return new Response(JSON.stringify({ favorites: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { results } = await db
      .prepare('SELECT plugin_id FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all();

    const favorites = (results || []).map((row: any) => row.plugin_id);
    return new Response(JSON.stringify({ favorites }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, favorites: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth ? locals.auth() : null;
  const userId = auth?.userId;

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = getDatabase(locals);
  if (!db) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await request.json()) as FavRequestBody;
    const ids = body.pluginIds || (body.pluginId ? [body.pluginId] : []);

    // Ensure user record exists
    await db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)').bind(userId).run();

    // Batch insert favorites
    const stmts = ids.map((id) =>
      db
        .prepare('INSERT OR IGNORE INTO user_favorites (user_id, plugin_id) VALUES (?, ?)')
        .bind(userId, id),
    );

    if (stmts.length > 0) {
      await db.batch(stmts);
    }

    return new Response(JSON.stringify({ success: true, count: ids.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const auth = locals.auth ? locals.auth() : null;
  const userId = auth?.userId;

  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = getDatabase(locals);
  if (!db) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as FavRequestBody;

    if (body.pluginId) {
      await db
        .prepare('DELETE FROM user_favorites WHERE user_id = ? AND plugin_id = ?')
        .bind(userId, body.pluginId)
        .run();
    } else {
      await db.prepare('DELETE FROM user_favorites WHERE user_id = ?').bind(userId).run();
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
