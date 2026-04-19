export interface PluginLike {
  id: string;
  vendor?: string;
  componentClasses?: string[];
  stats?: {
    absoluteDownloads?: number;
    trendingDelta?: number;
  };
  isAiReady?: boolean;
  isFeatured?: boolean;
  sponsored?: boolean;
}

// Intentionally loose — `plugins_data.json` infers per-key union types which
// cannot be structurally narrowed to `Record<string, PluginVersionEntry>`.
// Consumers access fields defensively at runtime.
export interface ChangelogSource {
  versions?: Record<string, unknown> | undefined;
}

export type PluginCategory =
  | 'Assertions'
  | 'Listeners'
  | 'Samplers'
  | 'Configs'
  | 'Timers'
  | 'Processors'
  | 'Others';

/**
 * Infer a broad category for a plugin from its componentClasses.
 * Kept in sync with the taxonomy displayed on PluginCard.
 */
export function inferCategory(plugin: PluginLike): PluginCategory {
  if (!plugin || !plugin.componentClasses || plugin.componentClasses.length === 0) {
    return 'Others';
  }
  const classesStr = plugin.componentClasses.join(' ').toLowerCase();
  if (classesStr.includes('assertion')) return 'Assertions';
  if (classesStr.includes('listener') || classesStr.includes('visualizer')) return 'Listeners';
  if (classesStr.includes('sampler')) return 'Samplers';
  if (classesStr.includes('config')) return 'Configs';
  if (classesStr.includes('timer')) return 'Timers';
  if (classesStr.includes('processor')) return 'Processors';
  return 'Others';
}

export interface RelatedPluginsOptions {
  limit?: number;
}

export interface RelatedPluginsResult<T extends PluginLike> {
  sameVendor: T[];
  sameCategory: T[];
}

/**
 * Compute related plugins for a given plugin.
 * - `sameVendor`: other plugins sharing the vendor, sorted by absoluteDownloads desc.
 * - `sameCategory`: plugins sharing the inferred category (excluding those already in
 *   `sameVendor`), sorted by absoluteDownloads desc. Empty when category is "Others".
 */
export function getRelatedPlugins<T extends PluginLike>(
  current: T,
  all: T[],
  options: RelatedPluginsOptions = {}
): RelatedPluginsResult<T> {
  const limit = options.limit ?? 3;
  if (!current || !Array.isArray(all)) {
    return { sameVendor: [], sameCategory: [] };
  }

  const byDownloads = (a: T, b: T) =>
    (b.stats?.absoluteDownloads ?? 0) - (a.stats?.absoluteDownloads ?? 0);

  const others = all.filter((p) => p && p.id !== current.id);

  const sameVendor = current.vendor
    ? others
        .filter((p) => p.vendor && p.vendor === current.vendor)
        .slice()
        .sort(byDownloads)
        .slice(0, limit)
    : [];

  const currentCategory = inferCategory(current);
  let sameCategory: T[] = [];
  if (currentCategory !== 'Others') {
    const vendorIds = new Set(sameVendor.map((p) => p.id));
    sameCategory = others
      .filter((p) => !vendorIds.has(p.id) && inferCategory(p) === currentCategory)
      .slice()
      .sort(byDownloads)
      .slice(0, limit);
  }

  return { sameVendor, sameCategory };
}

export interface ChangelogEntry {
  version: string;
  changes: string | null;
  downloadUrl: string | null;
  libs: Array<{ name: string; url: string }>;
  isMavenTemplate: boolean;
}

const MAVEN_TEMPLATE_MARKER = '%1$s';

/**
 * Returns true when the plugin has at least one meaningful release entry —
 * i.e. a non-empty version key whose downloadUrl is a concrete URL rather
 * than a Maven template placeholder.
 */
export function hasChangelog(plugin: ChangelogSource): boolean {
  const versions = plugin?.versions;
  if (!versions || typeof versions !== 'object') return false;
  for (const key of Object.keys(versions)) {
    if (!key) continue;
    const entry = (versions as Record<string, any>)[key];
    if (!entry) continue;
    const url: string = entry.downloadUrl ?? '';
    if (url && url.includes(MAVEN_TEMPLATE_MARKER)) continue;
    return true;
  }
  return false;
}

/**
 * Semver-aware comparator that orders version strings descending (newest
 * first). Numeric path segments compare numerically so `1.10` > `1.9`;
 * non-numeric suffixes fall back to locale compare so labels such as
 * `1.0-beta` remain deterministic.
 */
function compareVersionsDesc(a: string, b: string): number {
  const aParts = a.split('.');
  const bParts = b.split('.');
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ap = aParts[i] ?? '';
    const bp = bParts[i] ?? '';
    const an = Number(ap);
    const bn = Number(bp);
    const aIsNum = ap !== '' && Number.isFinite(an);
    const bIsNum = bp !== '' && Number.isFinite(bn);
    if (aIsNum && bIsNum) {
      if (an !== bn) return bn - an;
      continue;
    }
    if (aIsNum !== bIsNum) {
      // Pure numeric segments sort as "newer" than mixed/suffix ones
      // (e.g. `1.0` is considered newer than `1.0-beta`).
      return aIsNum ? -1 : 1;
    }
    const cmp = bp.localeCompare(ap);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/**
 * Build a newest-first timeline of releases from a plugin's `versions` map.
 * Skips empty-string version keys and normalises `libs` into a sorted array.
 */
export function getChangelogTimeline(plugin: ChangelogSource): ChangelogEntry[] {
  const versions = plugin?.versions;
  if (!versions || typeof versions !== 'object') return [];

  const keys = Object.keys(versions).filter((k) => k !== '');
  keys.sort(compareVersionsDesc);

  const versionsAny = versions as Record<string, any>;

  return keys.map((version) => {
    const entry = versionsAny[version] ?? {};
    const rawUrl: string = entry.downloadUrl ?? '';
    const isMavenTemplate = typeof rawUrl === 'string' && rawUrl.includes(MAVEN_TEMPLATE_MARKER);
    const downloadUrl = !rawUrl || isMavenTemplate ? null : rawUrl;

    const changesText = (entry.changes ?? '').toString().trim();
    const changes = changesText.length > 0 ? changesText : null;

    const libsObj: Record<string, any> =
      entry.libs && typeof entry.libs === 'object' ? entry.libs : {};
    const libs = Object.keys(libsObj)
      .filter((name) => typeof libsObj[name] === 'string' && libsObj[name])
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, url: libsObj[name] as string }));

    return { version, changes, downloadUrl, libs, isMavenTemplate };
  });
}

/**
 * Convert a free-form vendor name (e.g. "QAInsights.com", "JMeter-Plugins.org",
 * "BlazeMeter Inc.") to a URL-safe slug suitable for `/vendor/[slug]` routes.
 *
 * Rules:
 * - Lower-cased, ASCII-only (diacritics stripped via NFKD normalisation).
 * - Any run of characters outside `[a-z0-9]` becomes a single `-`.
 * - Leading / trailing `-` are trimmed.
 * - Empty / whitespace-only input collapses to `"unknown-vendor"` so routes
 *   remain valid even for pathological data.
 */
export function vendorSlug(vendor: string | undefined | null): string {
  if (!vendor) return 'unknown-vendor';
  const normalised = vendor
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalised.length > 0 ? normalised : 'unknown-vendor';
}

export interface VendorSummary<T extends PluginLike> {
  vendor: string;
  slug: string;
  plugins: T[];
  totalDownloads: number;
  totalTrending: number;
  pluginCount: number;
  aiReadyCount: number;
  featuredCount: number;
  categoryCounts: Record<PluginCategory, number>;
  topPlugin: T | null;
}

/**
 * Group plugins by vendor and compute per-vendor aggregates used by the
 * vendor landing page. Plugins within each group are sorted by absolute
 * downloads descending so the "top plugin" and grid ordering are stable.
 *
 * Slug collisions (two distinct vendor strings normalising to the same slug)
 * are resolved deterministically by appending `-2`, `-3`, ... to the later
 * entries — this keeps `getStaticPaths()` duplicate-free.
 */
export function getVendors<T extends PluginLike>(all: T[]): VendorSummary<T>[] {
  if (!Array.isArray(all)) return [];

  const groups = new Map<string, T[]>();
  for (const p of all) {
    if (!p || !p.vendor) continue;
    const key = p.vendor;
    const existing = groups.get(key);
    if (existing) existing.push(p);
    else groups.set(key, [p]);
  }

  const byDownloads = (a: T, b: T) =>
    (b.stats?.absoluteDownloads ?? 0) - (a.stats?.absoluteDownloads ?? 0);

  const usedSlugs = new Map<string, number>();
  const summaries: VendorSummary<T>[] = [];

  // Preserve deterministic ordering: vendors sorted by descending total downloads.
  const orderedVendors = Array.from(groups.entries())
    .map(([vendor, plugins]) => {
      const totalDownloads = plugins.reduce(
        (sum, p) => sum + (p.stats?.absoluteDownloads ?? 0),
        0
      );
      return { vendor, plugins, totalDownloads };
    })
    .sort((a, b) => b.totalDownloads - a.totalDownloads || a.vendor.localeCompare(b.vendor));

  for (const { vendor, plugins, totalDownloads } of orderedVendors) {
    const baseSlug = vendorSlug(vendor);
    const seen = usedSlugs.get(baseSlug) ?? 0;
    const slug = seen === 0 ? baseSlug : `${baseSlug}-${seen + 1}`;
    usedSlugs.set(baseSlug, seen + 1);

    const sortedPlugins = plugins.slice().sort(byDownloads);

    const categoryCounts: Record<PluginCategory, number> = {
      Assertions: 0,
      Listeners: 0,
      Samplers: 0,
      Configs: 0,
      Timers: 0,
      Processors: 0,
      Others: 0,
    };

    let totalTrending = 0;
    let aiReadyCount = 0;
    let featuredCount = 0;

    for (const p of sortedPlugins) {
      totalTrending += p.stats?.trendingDelta ?? 0;
      if (p.isAiReady) aiReadyCount++;
      if (p.isFeatured) featuredCount++;
      categoryCounts[inferCategory(p)]++;
    }

    summaries.push({
      vendor,
      slug,
      plugins: sortedPlugins,
      totalDownloads,
      totalTrending,
      pluginCount: sortedPlugins.length,
      aiReadyCount,
      featuredCount,
      categoryCounts,
      topPlugin: sortedPlugins[0] ?? null,
    });
  }

  return summaries;
}
