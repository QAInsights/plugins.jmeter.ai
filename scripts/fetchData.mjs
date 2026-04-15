import fs from 'fs/promises';
import path from 'path';

const REPO_URL = 'https://jmeter-plugins.org/repo/various.json';
const STATS_URL = 'https://jmeter-plugins.org/dat/stats/plugins_usage_history.json';
// Other possible files like blazemeter.json, jpgc-plugins.json etc could be added here if needed, 
// but various.json is the main one the user highlighted.

// Example overrides for future monetization and tags
const SPONSORED_PLUGINS = []; // Add plugin IDs here to mark them as sponsored
const AI_READY_PLUGINS = ['feather-wand-jmeter-ai-agent']; // Example AI plugin

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
    return await res.json();
}

function calculateTrending(historyData) {
    if (!historyData) return 0;
    
    // historyData is an object like {"2026-03-16": 12, "2026-03-23": 25}
    const dates = Object.keys(historyData).sort();
    if (dates.length < 2) return 0;

    const latestDate = dates[dates.length - 1];
    const previousDate = dates[dates.length - 2];

    const currentDownloads = historyData[latestDate] || 0;
    const previousDownloads = historyData[previousDate] || 0;

    return currentDownloads - previousDownloads; // Positive means growing usage
}

async function main() {
    console.log('Fetching plugins metadata from upstream...');
    const pluginsMeta = await fetchJson(REPO_URL);
    
    console.log('Fetching historical usage stats...');
    const pluginsStats = await fetchJson(STATS_URL);

    console.log('Enriching data with trending calculations and custom tags...');
    
    const enrichedPlugins = pluginsMeta.map(plugin => {
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
