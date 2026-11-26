import type { APIRoute } from 'astro';
import pluginsData from '../../data/plugins_data.json';

export const prerender = true;

export const GET: APIRoute = () => {
  return new Response(JSON.stringify(pluginsData), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
