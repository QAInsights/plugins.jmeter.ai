import type { APIRoute } from 'astro';
import pluginsData from '../../../data/plugins_data.json';
import type { PluginLike } from '../../../utils/plugin';

export const prerender = false;

function formatBadgeNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return num.toString();
}

export const GET: APIRoute = async ({ params, locals }) => {
  const pluginId = params.id;
  if (!pluginId) {
    return new Response(JSON.stringify({ error: 'Plugin ID required' }), { status: 400 });
  }

  // Check KV Cache if available
  const kv = (locals.runtime?.env as any)?.KV;
  const cacheKey = `badge:v1:${pluginId}`;

  if (kv) {
    const cached = await kv.get(cacheKey, 'json').catch(() => null);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      });
    }
  }

  const plugin = (pluginsData as PluginLike[]).find((p) => p.id === pluginId);
  if (!plugin) {
    return new Response(
      JSON.stringify({
        schemaVersion: 1,
        label: 'jmeter plugin',
        message: 'not found',
        color: 'inactive',
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const downloads = plugin.stats?.absoluteDownloads ?? 0;
  const formattedDownloads = formatBadgeNumber(downloads);

  const payload = {
    schemaVersion: 1,
    label: 'downloads',
    message: `${formattedDownloads}`,
    color: downloads > 500_000 ? 'brightgreen' : downloads > 50_000 ? 'green' : 'blue',
  };

  // Cache in KV for 1 hour
  if (kv) {
    await kv.put(cacheKey, JSON.stringify(payload), { expirationTtl: 3600 }).catch(() => undefined);
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};
