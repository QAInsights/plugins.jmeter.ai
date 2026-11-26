import type { APIRoute } from 'astro';
import pluginsData from '../../data/plugins_data.json';
import { inferCategory } from '../../utils/plugin';

export const prerender = true;

export const GET: APIRoute = () => {
  const trending = [...pluginsData]
    .sort((a, b) => (b.stats?.trendingDelta || 0) - (a.stats?.trendingDelta || 0))
    .slice(0, 25)
    .map((p) => ({
      id: p.id,
      name: p.name,
      vendor: p.vendor,
      category: inferCategory(p),
      description: p.description,
      url: `https://plugins.jmeter.ai/plugin/${p.id}/`,
      markdownUrl: `https://plugins.jmeter.ai/plugin/${p.id}.md`,
      absoluteDownloads: p.stats?.absoluteDownloads || 0,
      trendingDelta: p.stats?.trendingDelta || 0,
      isAiReady: Boolean(p.isAiReady),
      health: p.githubInfo?.health || null,
    }));

  return new Response(
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalPlugins: pluginsData.length,
      trending,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    },
  );
};
