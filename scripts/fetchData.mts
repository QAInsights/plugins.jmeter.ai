import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import {
  parseGitHubRepo,
  computeHealth,
  enrichPluginWithHealth,
  type GitHubSignals,
} from '../src/utils/health.ts';

// Load environment variables from .env file manually since node/tsx doesn't do it automatically
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fsSync.existsSync(envPath)) {
    const envContent = fsSync.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        // Only set if not already set by system environment
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  }
} catch (e: any) {
  console.warn('Failed to parse .env file:', e.message);
}

const REPOS = [
  'https://raw.githubusercontent.com/undera/jmeter-plugins/master/site/dat/repo/blazemeter.json',
  'https://raw.githubusercontent.com/undera/jmeter-plugins/master/site/dat/repo/jmeter.json',
  'https://raw.githubusercontent.com/undera/jmeter-plugins/master/site/dat/repo/jpgc-graphs.json',
  'https://raw.githubusercontent.com/undera/jmeter-plugins/master/site/dat/repo/jpgc-plugins.json',
  'https://raw.githubusercontent.com/undera/jmeter-plugins/master/site/dat/repo/jpgc-sets.json',
  'https://raw.githubusercontent.com/undera/jmeter-plugins/master/site/dat/repo/jpgc-tools.json',
  'https://raw.githubusercontent.com/undera/jmeter-plugins/master/site/dat/repo/self.json',
  'https://raw.githubusercontent.com/undera/jmeter-plugins/master/site/dat/repo/various.json',
];

const STATS_URL = 'https://jmeter-plugins.org/dat/stats/plugins_usage_history.json';

let SPONSORED_PLUGINS: string[] = [];
let AI_READY_PLUGINS: string[] = [];
let FEATURED_PLUGINS: string[] = [];

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  return await res.json();
}

export function calculateTrending(historyData: Record<string, number> | undefined): number {
  if (!historyData) return 0;
  const dates = Object.keys(historyData).sort();
  if (dates.length < 2) return 0;
  const latestDate = dates[dates.length - 1];
  const previousDate = dates[dates.length - 2];
  const currentDownloads = historyData[latestDate] || 0;
  const previousDownloads = historyData[previousDate] || 0;
  return currentDownloads - previousDownloads;
}

// Concurrency-limited runner
async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 6,
): Promise<R[]> {
  const results: Promise<R>[] = [];
  const executing = new Set<Promise<any>>();

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);

    const e: Promise<any> = p.then(() => executing.delete(e));
    executing.add(e);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

// Fetch helper with token and error mapping
async function fetchGitHubRepoInfo(
  owner: string,
  repo: string,
  token?: string,
): Promise<{ signals: GitHubSignals; rateLimited: boolean } | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'PerfAtlas-Data-Fetcher',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const repoUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const res = await fetch(repoUrl, { headers });

    if (res.status === 403 || res.status === 429) {
      return { signals: {}, rateLimited: true };
    }
    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const signals: GitHubSignals = {
      stars: data.stargazers_count,
      forks: data.forks_count,
      openIssues: data.open_issues_count,
      archived: data.archived,
      pushedAt: data.pushed_at,
      updatedAt: data.updated_at,
      license: data.license ? (data.license.spdx_id || data.license.name || 'N/A') : 'N/A',
      fetchedAt: new Date().toISOString(),
    };

    // Attempt to fetch latest release
    try {
      const releaseUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
      const relRes = await fetch(releaseUrl, { headers });
      if (relRes.ok) {
        const relData = await relRes.json();
        signals.latestReleaseAt = relData.published_at;
      }
    } catch {
      // Gracefully ignore release fetch errors
    }

    return { signals, rateLimited: false };
  } catch {
    return null;
  }
}

async function main() {
  console.log('Fetching plugins metadata from upstream repos...');
  const allReposData = await Promise.all(
    REPOS.map((repo) => fetchJson(repo).catch(() => []))
  );
  const pluginsMeta = allReposData.flat();

  // Deduplicate by ID
  const uniquePluginsMap = new Map();
  pluginsMeta.forEach((p) => uniquePluginsMap.set(p.id, p));
  const uniquePlugins = Array.from(uniquePluginsMap.values());

  console.log('Fetching historical usage stats...');
  const pluginsStats = await fetchJson(STATS_URL);

  // Read user overrides
  try {
    const overridesPath = path.join(process.cwd(), 'src', 'data', 'overrides.json');
    const overridesRaw = await fs.readFile(overridesPath, 'utf-8');
    const overrides = JSON.parse(overridesRaw);
    SPONSORED_PLUGINS = overrides.sponsoredPlugins || [];
    AI_READY_PLUGINS = overrides.aiReadyPlugins || [];
    FEATURED_PLUGINS = overrides.featuredPlugins || [];
    console.log(
      `Loaded overrides: ${SPONSORED_PLUGINS.length} sponsored, ${AI_READY_PLUGINS.length} AI-ready.`
    );
  } catch (_e) {
    console.warn('Could not read custom overrides.json, using defaults.');
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.warn(
      '⚠️ WARNING: GITHUB_TOKEN env variable is missing. GitHub API queries will be rate-limited to 60 requests/hour.'
    );
  }

  let rateLimitHit = false;
  console.log('Enriching data with trending calculations and GitHub health signals...');

  const enrichedPlugins = await runWithConcurrency(
    uniquePlugins,
    async (plugin) => {
      const id = plugin.id;
      const stats = pluginsStats[id] || {};
      const trendingDelta = calculateTrending(stats);

      const dates = Object.keys(stats).sort();
      const absoluteDownloads = dates.length > 0 ? stats[dates[dates.length - 1]] : 0;

      let baseEnriched = {
        ...plugin,
        sponsored: SPONSORED_PLUGINS.includes(id),
        isAiReady: AI_READY_PLUGINS.includes(id),
        isFeatured: FEATURED_PLUGINS.includes(id),
        stats: {
          trendingDelta,
          absoluteDownloads,
          history: stats,
        },
      };

      const parsedRepo = parseGitHubRepo(plugin.helpUrl);
      if (!parsedRepo || rateLimitHit) {
        return baseEnriched;
      }

      const ghResult = await fetchGitHubRepoInfo(
        parsedRepo.owner,
        parsedRepo.repo,
        githubToken
      );

      if (ghResult?.rateLimited) {
        rateLimitHit = true;
        console.warn('🛑 GitHub API rate limit hit. Aborting further enrichment requests.');
        return baseEnriched;
      }

      if (ghResult?.signals) {
        const health = computeHealth(ghResult.signals);
        // Override repoUrl with actual parsed URL
        health.repoUrl = `https://github.com/${parsedRepo.owner}/${parsedRepo.repo}`;
        return enrichPluginWithHealth(baseEnriched, health);
      }

      return baseEnriched;
    },
    6
  );

  // Sort by popularity (absolute downloads) or trending delta
  enrichedPlugins.sort((a, b) => b.stats.trendingDelta - a.stats.trendingDelta);

  const outPath = path.join(process.cwd(), 'src', 'data', 'plugins_data.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(enrichedPlugins, null, 2), 'utf-8');

  console.log(
    `Successfully generated plugins_data.json with ${enrichedPlugins.length} plugins at ${outPath}`
  );

  // Copy generated blog image if found in the brain folder
  try {
    const brainDir =
      'C:\\Users\\Navee\\.gemini\\antigravity-cli\\brain\\c2b725d7-b131-420d-8d36-cf51fa87da44';
    const files = await fs.readdir(brainDir);
    const imageFile = files.find((f) => f.startsWith('jmeter_perfmon_blog') && f.endsWith('.png'));
    if (imageFile) {
      const srcPath = path.join(brainDir, imageFile);
      const destPath = path.join(
        process.cwd(),
        'src',
        'assets',
        'blog',
        'jmeter-perfmon-plugin-server-monitoring.png',
      );
      await fs.copyFile(srcPath, destPath);
      console.log(`Successfully copied blog image to ${destPath}`);
    } else {
      console.warn('Could not find generated blog image in brain directory.');
    }
  } catch (e: any) {
    console.warn('Could not copy generated blog image from brain directory:', e.message);
  }
}

main().catch((err) => {
  console.error('Error in fetching plugins data:', err);
  process.exit(1);
});
