import type { APIRoute } from 'astro';

export const prerender = false;

interface ReviewRequestBody {
  pluginId: string;
  rating?: number;
  isRecommended?: number;
  title?: string;
  body?: string;
  jmeterVersionUsed?: string;
}

function getDatabase(locals: App.Locals) {
  return (locals.runtime?.env as any)?.DB;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const pluginId = url.searchParams.get('pluginId');

  if (!pluginId) {
    return new Response(JSON.stringify({ error: 'pluginId query param is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = getDatabase(locals);
  if (!db) {
    return new Response(JSON.stringify({ reviews: [], stats: { count: 0, average: 0 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { results: reviews } = await db
      .prepare(
        `SELECT r.id, r.plugin_id, r.rating, r.is_recommended, r.title, r.body,
                r.jmeter_version_used, r.created_at, u.full_name, u.avatar_url
         FROM plugin_reviews r
         LEFT JOIN users u ON r.user_id = u.id
         WHERE r.plugin_id = ?
         ORDER BY r.created_at DESC`,
      )
      .bind(pluginId)
      .all();

    const ratings = (reviews || [])
      .map((r: any) => r.rating)
      .filter((r: any): r is number => typeof r === 'number');

    const average =
      ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0;

    return new Response(
      JSON.stringify({
        reviews: reviews || [],
        stats: {
          count: ratings.length,
          average: Math.round(average * 10) / 10,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, reviews: [] }), {
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
    const body = (await request.json()) as ReviewRequestBody;
    if (!body.pluginId) {
      return new Response(JSON.stringify({ error: 'pluginId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const reviewId = `rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Ensure user record exists
    await db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)').bind(userId).run();

    // Upsert review
    await db
      .prepare(
        `INSERT INTO plugin_reviews (id, plugin_id, user_id, rating, is_recommended, title, body, jmeter_version_used, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
         ON CONFLICT(user_id, plugin_id) DO UPDATE SET
           rating = excluded.rating,
           is_recommended = excluded.is_recommended,
           title = excluded.title,
           body = excluded.body,
           jmeter_version_used = excluded.jmeter_version_used,
           updated_at = unixepoch()`,
      )
      .bind(
        reviewId,
        body.pluginId,
        userId,
        body.rating ?? null,
        body.isRecommended ?? null,
        body.title ?? null,
        body.body ?? null,
        body.jmeterVersionUsed ?? null,
      )
      .run();

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
