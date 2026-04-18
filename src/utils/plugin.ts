export interface PluginLike {
  id: string;
  vendor?: string;
  componentClasses?: string[];
  stats?: {
    absoluteDownloads?: number;
  };
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
