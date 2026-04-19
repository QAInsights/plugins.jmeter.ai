/**
 * Utility types and functions for the /collections feature.
 *
 * `collections.json` is the hand-curated source of truth. The daily sync
 * workflow only touches `plugins_data.json` (it git-adds only that file),
 * so collections.json is never overwritten by CI. Plugin IDs referenced in
 * a collection that no longer exist in plugins_data.json are silently
 * filtered out — the build never fails because of a stale collection entry.
 */

/** The shape of a single entry inside collections.json. */
export interface CollectionRaw {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  curator: {
    name: string;
    org: string;
    url: string;
  };
  /**
   * Ordered list of plugin IDs. The special sentinel value `"auto:isAiReady"`
   * causes the resolver to auto-populate from plugins with `isAiReady === true`.
   */
  pluginIds: string[];
  /** Per-plugin "why it's in this stack" sentences. */
  reasons: Record<string, string>;
  /** IDs of related collections (shown at the bottom of the detail page). */
  relatedIds: string[];
}

/** Minimal plugin shape required by collection utilities. */
export interface CollectionPlugin {
  id: string;
  name: string;
  vendor?: string;
  description?: string;
  isAiReady?: boolean;
  isFeatured?: boolean;
  sponsored?: boolean;
  componentClasses?: string[];
  stats?: {
    absoluteDownloads?: number;
    trendingDelta?: number;
  };
}

/** A resolved collection with plugin objects joined in. */
export interface Collection extends Omit<CollectionRaw, 'pluginIds'> {
  plugins: CollectionPlugin[];
  pluginCount: number;
  totalDownloads: number;
  totalTrending: number;
  aiReadyCount: number;
}

/** Lightweight summary used on the index grid card. */
export interface CollectionSummary {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  pluginCount: number;
  previewPlugins: CollectionPlugin[];
  totalDownloads: number;
  aiReadyCount: number;
}

const AI_READY_SENTINEL = 'auto:isAiReady';
const AI_READY_CAP = 12;

/**
 * Build the sorted, de-duped plugin list for a collection.
 *
 * - `"auto:isAiReady"` is replaced with all `isAiReady === true` plugins from
 *   `allPlugins`, sorted by absoluteDownloads desc, capped at `AI_READY_CAP`.
 * - All other IDs are looked up in `allPlugins`; unknown IDs are dropped with
 *   a console.warn so the build never breaks due to a stale collection entry.
 */
function resolvePlugins(
  raw: CollectionRaw,
  pluginIndex: Map<string, CollectionPlugin>
): CollectionPlugin[] {
  if (raw.pluginIds.includes(AI_READY_SENTINEL)) {
    const byDownloads = (a: CollectionPlugin, b: CollectionPlugin) =>
      (b.stats?.absoluteDownloads ?? 0) - (a.stats?.absoluteDownloads ?? 0);
    return Array.from(pluginIndex.values())
      .filter((p) => p.isAiReady === true)
      .sort(byDownloads)
      .slice(0, AI_READY_CAP);
  }

  return raw.pluginIds.reduce<CollectionPlugin[]>((acc, id) => {
    const found = pluginIndex.get(id);
    if (!found) {
      console.warn(
        `[collections] Plugin ID "${id}" referenced in collection "${raw.id}" was not found in plugins_data.json. It may have been removed from the upstream registry. Remove or update the entry in collections.json.`
      );
      return acc;
    }
    acc.push(found);
    return acc;
  }, []);
}

/**
 * Join `rawCollections` with `allPlugins`, resolve auto-populate sentinels,
 * and compute per-collection aggregates.
 *
 * The daily sync job only writes `plugins_data.json`; it never touches
 * `collections.json`, so there is no conflict between this function and the
 * automated sync workflow.
 */
export function getCollections(
  allPlugins: CollectionPlugin[],
  rawCollections: CollectionRaw[]
): Collection[] {
  if (!Array.isArray(allPlugins) || !Array.isArray(rawCollections)) return [];

  const pluginIndex = new Map(allPlugins.map((p) => [p.id, p]));

  return rawCollections.map((raw) => {
    const plugins = resolvePlugins(raw, pluginIndex);

    const totalDownloads = plugins.reduce(
      (sum, p) => sum + (p.stats?.absoluteDownloads ?? 0),
      0
    );
    const totalTrending = plugins.reduce(
      (sum, p) => sum + (p.stats?.trendingDelta ?? 0),
      0
    );
    const aiReadyCount = plugins.filter((p) => p.isAiReady).length;

    return {
      id: raw.id,
      name: raw.name,
      emoji: raw.emoji,
      tagline: raw.tagline,
      description: raw.description,
      curator: raw.curator,
      reasons: raw.reasons,
      relatedIds: raw.relatedIds,
      plugins,
      pluginCount: plugins.length,
      totalDownloads,
      totalTrending,
      aiReadyCount,
    };
  });
}

/**
 * Return a `CollectionSummary` array — a lighter projection used by the
 * index grid page. Avoids serialising full plugin data into every card.
 */
export function getCollectionSummaries(collections: Collection[]): CollectionSummary[] {
  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    tagline: c.tagline,
    pluginCount: c.pluginCount,
    previewPlugins: c.plugins.slice(0, 3),
    totalDownloads: c.totalDownloads,
    aiReadyCount: c.aiReadyCount,
  }));
}

/**
 * Look up a single resolved collection by ID. Returns `undefined` if not found.
 */
export function getCollectionById(
  id: string,
  collections: Collection[]
): Collection | undefined {
  return collections.find((c) => c.id === id);
}

/**
 * Return up to `limit` related collections.
 * Prefers `relatedIds` listed explicitly, then pads with the highest-download
 * remaining collections (excluding `self`).
 */
export function getRelatedCollections(
  self: Collection,
  all: Collection[],
  limit = 3
): Collection[] {
  const others = all.filter((c) => c.id !== self.id);

  const explicit = self.relatedIds
    .map((id) => others.find((c) => c.id === id))
    .filter((c): c is Collection => c !== undefined)
    .slice(0, limit);

  if (explicit.length >= limit) return explicit;

  const explicitIds = new Set(explicit.map((c) => c.id));
  const pad = others
    .filter((c) => !explicitIds.has(c.id))
    .sort((a, b) => b.totalDownloads - a.totalDownloads)
    .slice(0, limit - explicit.length);

  return [...explicit, ...pad];
}

/**
 * Build the PluginsManagerCMD install argument string.
 *
 * @example
 * buildInstallCommand(['jpgc-plancheck', 'jpgc-autostop'])
 * // => 'jpgc-plancheck,jpgc-autostop'
 */
export function buildInstallCommand(ids: string[]): string {
  return ids.join(',');
}

/**
 * Validate that every explicitly listed plugin ID in every collection still
 * exists in the current plugins_data.json. Used by tests to catch drift
 * introduced by the daily sync removing upstream plugins.
 *
 * Returns an array of { collectionId, pluginId } pairs that are missing.
 */
export function validateCollectionIds(
  allPlugins: CollectionPlugin[],
  rawCollections: CollectionRaw[]
): Array<{ collectionId: string; pluginId: string }> {
  const knownIds = new Set(allPlugins.map((p) => p.id));
  const missing: Array<{ collectionId: string; pluginId: string }> = [];

  for (const col of rawCollections) {
    for (const pid of col.pluginIds) {
      if (pid === AI_READY_SENTINEL) continue;
      if (!knownIds.has(pid)) {
        missing.push({ collectionId: col.id, pluginId: pid });
      }
    }
  }

  return missing;
}
