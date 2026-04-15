import fs from 'fs/promises';
import path from 'path';

const REPOS = [
    'https://jmeter-plugins.org/repo/blazemeter.json',
    'https://jmeter-plugins.org/repo/jmeter.json',
    'https://jmeter-plugins.org/repo/jpgc-graphs.json',
    'https://jmeter-plugins.org/repo/jpgc-plugins.json',
    'https://jmeter-plugins.org/repo/jpgc-sets.json',
    'https://jmeter-plugins.org/repo/jpgc-tools.json',
    'https://jmeter-plugins.org/repo/self.json',
    'https://jmeter-plugins.org/repo/various.json'
];

const STATS_URL = 'https://jmeter-plugins.org/dat/stats/plugins_usage_history.json';

// Example overrides for future monetization and tags
const SPONSORED_PLUGINS = ['jmeter-studio-oss']; // Make JMeter Studio sponsor as a demo
const AI_READY_PLUGINS = ['feather-wand-jmeter-ai-agent']; 
const FEATURED_PLUGINS = []; // Real featured logic goes here in the future

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
    return await res.json();
}

function calculateTrending(historyData) {
    if (!historyData) return 0;
    const dates = Object.keys(historyData).sort();
    if (dates.length < 2) return 0;
    const latestDate = dates[dates.length - 1];
    const previousDate = dates[dates.length - 2];
    const currentDownloads = historyData[latestDate] || 0;
    const previousDownloads = historyData[previousDate] || 0;
    return currentDownloads - previousDownloads;
}

async function main() {
    console.log('Fetching plugins metadata from upstream repos...');
    const allReposData = await Promise.all(REPOS.map(repo => fetchJson(repo).catch(() => [])));
    const pluginsMeta = allReposData.flat();

    // Deduplicate by ID
    const uniquePluginsMap = new Map();
    pluginsMeta.forEach(p => uniquePluginsMap.set(p.id, p));
    const uniquePlugins = Array.from(uniquePluginsMap.values());
    
    console.log('Fetching historical usage stats...');
    const pluginsStats = await fetchJson(STATS_URL);

    console.log('Enriching data with trending calculations and custom tags...');
    
    const enrichedPlugins = uniquePlugins.map(plugin => {
        const id = plugin.id;
        const stats = pluginsStats[id] || {};
        
        // Calculate trending delta
        const trendingDelta = calculateTrending(stats);

        // Get total known downloads (the latest absolute value in the stats)
        const dates = Object.keys(stats).sort();
        const absoluteDownloads = dates.length > 0 ? stats[dates[dates.length - 1]] : 0;

        return {
            ...plugin,
            sponsored: SPONSORED_PLUGINS.includes(id),
            isAiReady: AI_READY_PLUGINS.includes(id),
            isFeatured: FEATURED_PLUGINS.includes(id),
            stats: {
                trendingDelta,
                absoluteDownloads,
                history: stats
            }
        };
    });

    // Optionally sort by popularity (absolute downloads) or trending delta
    enrichedPlugins.sort((a, b) => b.stats.trendingDelta - a.stats.trendingDelta);

    const outPath = path.join(process.cwd(), 'src', 'data', 'plugins_data.json');
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    
    await fs.writeFile(outPath, JSON.stringify(enrichedPlugins, null, 2), 'utf-8');
    
    console.log(`Successfully generated plugins_data.json with ${enrichedPlugins.length} plugins at ${outPath}`);
}

main().catch(err => {
    console.error('Error in fetching plugins data:', err);
    process.exit(1);
});
