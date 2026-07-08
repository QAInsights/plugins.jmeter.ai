import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import {
  parseGitHubRepo,
  computeHealth,
  enrichPluginWithHealth,
  type GitHubSignals,
} from '../src/utils/health.ts';
import {
  getChangelogTimeline,
  type PluginLike,
  type ChangelogSource,
} from '../src/utils/plugin.ts';
import {
  parseMavenCoordinates,
  extractJMeterVersionFromPom,
  parseChangelogCompatibility,
} from '../src/utils/jmeterCompatibility.ts';

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
        const val = parts
          .slice(1)
          .join('=')
          .trim()
          .replace(/^['"]|['"]$/g, '');
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
let JMETER_COMPATIBILITY_OVERRIDES: Record<string, string> = {};

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
      license: data.license ? data.license.spdx_id || data.license.name || 'N/A' : 'N/A',
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

interface PomDependency {
  groupId: string;
  artifactId: string;
  version: string;
  scope?: string;
}

function parsePomDependencies(pomText: string): PomDependency[] {
  const deps: PomDependency[] = [];
  const dependencyRegex = /<dependency>([\s\S]*?)<\/dependency>/g;
  let match: RegExpExecArray | null;
  while ((match = dependencyRegex.exec(pomText)) !== null) {
    const block = match[1];
    const groupId = block.match(/<groupId>([^<]+)<\/groupId>/)?.[1]?.trim() ?? '';
    const artifactId = block.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1]?.trim() ?? '';
    const version = block.match(/<version>([^<]+)<\/version>/)?.[1]?.trim() ?? '';
    const scope = block.match(/<scope>([^<]+)<\/scope>/)?.[1]?.trim();
    if (groupId && artifactId && version) {
      deps.push({ groupId, artifactId, version, scope });
    }
  }
  return deps;
}

function buildPomUrl(groupId: string, artifactId: string, version: string): string {
  const groupPath = groupId.replace(/\./g, '/');
  return `https://repo1.maven.org/maven2/${groupPath}/${artifactId}/${version}/${artifactId}-${version}.pom`;
}

function isPlaceholderVersion(version: string): boolean {
  return version.includes('$') || version.includes('%');
}

async function fetchJMeterVersionFromPom(
  pomUrl: string,
  visited: Set<string> = new Set(),
  depth = 2,
): Promise<string | null> {
  if (visited.has(pomUrl) || depth < 0) return null;
  visited.add(pomUrl);

  const maxAttempts = 3;
  let pomText: string | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(pomUrl, {
        headers: { 'User-Agent': 'PerfAtlas-Data-Fetcher' },
      });
      if (res.ok) {
        pomText = await res.text();
        break;
      }
      // Retry on rate-limit or server errors; don't retry client errors.
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return null;
    } catch {
      // Network / transient errors are retried up to maxAttempts.
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  if (!pomText) return null;

  const directVersion = extractJMeterVersionFromPom(pomText);
  if (directVersion) return directVersion;

  if (depth === 0) return null;

  // Recurse into JMeter-Plugins.org common libraries, which often declare
  // org.apache.jmeter:ApacheJMeter_* dependencies so plugins don't have to.
  const deps = parsePomDependencies(pomText);
  for (const dep of deps) {
    if (dep.scope === 'test') continue;
    if (isPlaceholderVersion(dep.version)) continue;

    if (dep.groupId === 'kg.apc' && dep.artifactId.startsWith('jmeter-plugins-')) {
      const transitive = await fetchJMeterVersionFromPom(
        buildPomUrl(dep.groupId, dep.artifactId, dep.version),
        visited,
        depth - 1,
      );
      if (transitive) return transitive;
    }
  }

  return null;
}

type EnrichablePlugin = PluginLike & ChangelogSource;

/**
 * Determine the minimum JMeter version a plugin is compatible with by
 * inspecting the latest concrete version:
 *   1. Maven POM dependency on org.apache.jmeter/ApacheJMeter_*
 *   2. The version's changelog text
 *   3. Optional manual override from overrides.json
 *
 * The result is stored on the plugin object as `jmeterCompatibility`.
 */
async function enrichJMeterCompatibility(
  plugin: EnrichablePlugin,
  overrides: Record<string, string>,
): Promise<EnrichablePlugin> {
  if (overrides[plugin.id]) {
    plugin.jmeterCompatibility = overrides[plugin.id];
    return plugin;
  }

  const timeline = getChangelogTimeline(plugin);
  const latest = timeline.find((entry) => entry.downloadUrl && !entry.isMavenTemplate);

  if (!latest) {
    plugin.jmeterCompatibility = null;
    return plugin;
  }

  let version: string | null = null;

  if (latest.downloadUrl) {
    const coords = parseMavenCoordinates(latest.downloadUrl);
    if (coords) {
      version = await fetchJMeterVersionFromPom(coords.pomUrl);
    }
  }

  // Fallback: some plugin POMs don't declare JMeter, but their bundled
  // library list includes jmeter-plugins-cmn-jmeter which carries the
  // ApacheJMeter_* dependency.
  if (!version && latest.libs && latest.libs.length > 0) {
    for (const lib of latest.libs) {
      const libCoords = parseMavenCoordinates(lib.url);
      if (libCoords) {
        const libVersion = await fetchJMeterVersionFromPom(libCoords.pomUrl);
        if (libVersion) {
          version = libVersion;
          break;
        }
      }
    }
  }

  if (!version && latest.changes) {
    version = parseChangelogCompatibility(latest.changes);
  }

  plugin.jmeterCompatibility = version;
  return plugin;
}

async function main() {
  console.log('Fetching plugins metadata from upstream repos...');
  const allReposData = await Promise.all(REPOS.map((repo) => fetchJson(repo).catch(() => [])));
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
    JMETER_COMPATIBILITY_OVERRIDES = overrides.jmeterCompatibility || {};
    console.log(
      `Loaded overrides: ${SPONSORED_PLUGINS.length} sponsored, ${AI_READY_PLUGINS.length} AI-ready, ${Object.keys(JMETER_COMPATIBILITY_OVERRIDES).length} compatibility.`,
    );
  } catch (_e) {
    console.warn('Could not read custom overrides.json, using defaults.');
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.warn(
      '⚠️ WARNING: GITHUB_TOKEN env variable is missing. GitHub API queries will be rate-limited to 60 requests/hour.',
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

      const baseEnriched = {
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

      const ghResult = await fetchGitHubRepoInfo(parsedRepo.owner, parsedRepo.repo, githubToken);

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
    6,
  );

  console.log('Enriching JMeter version compatibility...');
  await runWithConcurrency(
    enrichedPlugins as EnrichablePlugin[],
    (plugin) => enrichJMeterCompatibility(plugin, JMETER_COMPATIBILITY_OVERRIDES),
    4,
  );

  // Sort by popularity (absolute downloads) or trending delta
  enrichedPlugins.sort((a, b) => b.stats.trendingDelta - a.stats.trendingDelta);

  const outPath = path.join(process.cwd(), 'src', 'data', 'plugins_data.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(enrichedPlugins, null, 2), 'utf-8');

  console.log(
    `Successfully generated plugins_data.json with ${enrichedPlugins.length} plugins at ${outPath}`,
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
