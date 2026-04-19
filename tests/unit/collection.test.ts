import { describe, it, expect } from 'vitest';
import {
  getCollections,
  getCollectionById,
  getRelatedCollections,
  getCollectionSummaries,
  buildInstallCommand,
  validateCollectionIds,
  type CollectionRaw,
  type CollectionPlugin,
} from '../../src/utils/collection';
import pluginsData from '../../src/data/plugins_data.json';
import rawCollectionsData from '../../src/data/collections.json';

function makePlugin(id: string, overrides: Partial<CollectionPlugin> = {}): CollectionPlugin {
  return {
    id,
    name: `Plugin ${id}`,
    vendor: 'TestVendor',
    description: 'Test description',
    isAiReady: false,
    stats: { absoluteDownloads: 1000, trendingDelta: 10 },
    ...overrides,
  };
}

function makeCollection(id: string, pluginIds: string[] = [], overrides: Partial<CollectionRaw> = {}): CollectionRaw {
  return {
    id,
    name: `Collection ${id}`,
    emoji: '🔧',
    tagline: 'A test collection',
    description: 'Full description',
    curator: { name: 'NaveenKumar', org: 'QAInsights', url: 'https://qainsights.com' },
    pluginIds,
    reasons: {},
    relatedIds: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getCollections
// ─────────────────────────────────────────────────────────────────────────────

describe('getCollections', () => {
  it('should join plugin objects by ID', () => {
    const plugins = [makePlugin('a'), makePlugin('b')];
    const raws = [makeCollection('col-1', ['a', 'b'])];
    const [col] = getCollections(plugins, raws);
    expect(col.plugins).toHaveLength(2);
    expect(col.plugins.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('should silently drop unknown plugin IDs', () => {
    const plugins = [makePlugin('known')];
    const raws = [makeCollection('col-1', ['known', 'unknown-id'])];
    const [col] = getCollections(plugins, raws);
    expect(col.plugins).toHaveLength(1);
    expect(col.plugins[0].id).toBe('known');
  });

  it('should compute totalDownloads as sum across plugins', () => {
    const plugins = [
      makePlugin('a', { stats: { absoluteDownloads: 500, trendingDelta: 10 } }),
      makePlugin('b', { stats: { absoluteDownloads: 1500, trendingDelta: 20 } }),
    ];
    const raws = [makeCollection('col-1', ['a', 'b'])];
    const [col] = getCollections(plugins, raws);
    expect(col.totalDownloads).toBe(2000);
  });

  it('should compute totalTrending as sum across plugins', () => {
    const plugins = [
      makePlugin('a', { stats: { absoluteDownloads: 100, trendingDelta: 5 } }),
      makePlugin('b', { stats: { absoluteDownloads: 100, trendingDelta: -2 } }),
    ];
    const raws = [makeCollection('col-1', ['a', 'b'])];
    const [col] = getCollections(plugins, raws);
    expect(col.totalTrending).toBe(3);
  });

  it('should count aiReadyCount correctly', () => {
    const plugins = [
      makePlugin('a', { isAiReady: true }),
      makePlugin('b', { isAiReady: false }),
      makePlugin('c', { isAiReady: true }),
    ];
    const raws = [makeCollection('col-1', ['a', 'b', 'c'])];
    const [col] = getCollections(plugins, raws);
    expect(col.aiReadyCount).toBe(2);
  });

  it('auto-populates AI-ready plugins when sentinel is present', () => {
    const plugins = [
      makePlugin('ai-1', { isAiReady: true, stats: { absoluteDownloads: 3000, trendingDelta: 10 } }),
      makePlugin('ai-2', { isAiReady: true, stats: { absoluteDownloads: 1000, trendingDelta: 5 } }),
      makePlugin('regular', { isAiReady: false }),
    ];
    const raws = [makeCollection('ai-ready-starter', ['auto:isAiReady'])];
    const [col] = getCollections(plugins, raws);
    expect(col.plugins).toHaveLength(2);
    expect(col.plugins[0].id).toBe('ai-1');
    expect(col.plugins[1].id).toBe('ai-2');
  });

  it('should handle empty pluginIds gracefully', () => {
    const plugins = [makePlugin('a')];
    const raws = [makeCollection('col-1', [])];
    const [col] = getCollections(plugins, raws);
    expect(col.plugins).toHaveLength(0);
    expect(col.totalDownloads).toBe(0);
  });

  it('should handle empty plugins array', () => {
    const raws = [makeCollection('col-1', ['a', 'b'])];
    const result = getCollections([], raws);
    expect(result[0].plugins).toHaveLength(0);
  });

  it('should handle empty collections array', () => {
    const plugins = [makePlugin('a')];
    const result = getCollections(plugins, []);
    expect(result).toHaveLength(0);
  });

  it('should return empty array for invalid inputs', () => {
    expect(getCollections(null as any, null as any)).toEqual([]);
    expect(getCollections([], null as any)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCollectionById
// ─────────────────────────────────────────────────────────────────────────────

describe('getCollectionById', () => {
  it('should return collection by id', () => {
    const plugins = [makePlugin('a')];
    const raws = [makeCollection('ci-cd-stack', ['a']), makeCollection('obs-stack', ['a'])];
    const cols = getCollections(plugins, raws);
    const found = getCollectionById('ci-cd-stack', cols);
    expect(found).toBeDefined();
    expect(found?.id).toBe('ci-cd-stack');
  });

  it('should return undefined for unknown id', () => {
    const cols = getCollections([], [makeCollection('x', [])]);
    expect(getCollectionById('nonexistent', cols)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRelatedCollections
// ─────────────────────────────────────────────────────────────────────────────

describe('getRelatedCollections', () => {
  it('should return explicitly listed related collections', () => {
    const plugins = [makePlugin('a')];
    const raws = [
      makeCollection('col-1', ['a'], { relatedIds: ['col-2'] }),
      makeCollection('col-2', ['a']),
      makeCollection('col-3', ['a']),
    ];
    const cols = getCollections(plugins, raws);
    const [c1] = cols;
    const related = getRelatedCollections(c1, cols, 3);
    expect(related.some((c) => c.id === 'col-2')).toBe(true);
  });

  it('should never include self', () => {
    const plugins = [makePlugin('a')];
    const raws = [makeCollection('col-1', ['a']), makeCollection('col-2', ['a'])];
    const cols = getCollections(plugins, raws);
    const related = getRelatedCollections(cols[0], cols, 3);
    expect(related.every((c) => c.id !== 'col-1')).toBe(true);
  });

  it('should pad to limit when relatedIds provides fewer than limit', () => {
    const plugins = [makePlugin('a')];
    const raws = [
      makeCollection('col-1', ['a'], { relatedIds: [] }),
      makeCollection('col-2', ['a']),
      makeCollection('col-3', ['a']),
      makeCollection('col-4', ['a']),
    ];
    const cols = getCollections(plugins, raws);
    const related = getRelatedCollections(cols[0], cols, 3);
    expect(related).toHaveLength(3);
  });

  it('should respect the limit parameter', () => {
    const plugins = [makePlugin('a')];
    const raws = [
      makeCollection('c1', ['a'], { relatedIds: ['c2', 'c3', 'c4'] }),
      makeCollection('c2', ['a']),
      makeCollection('c3', ['a']),
      makeCollection('c4', ['a']),
    ];
    const cols = getCollections(plugins, raws);
    const related = getRelatedCollections(cols[0], cols, 2);
    expect(related).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getCollectionSummaries
// ─────────────────────────────────────────────────────────────────────────────

describe('getCollectionSummaries', () => {
  it('should return only the first 3 preview plugins', () => {
    const plugins = [makePlugin('a'), makePlugin('b'), makePlugin('c'), makePlugin('d')];
    const raws = [makeCollection('col-1', ['a', 'b', 'c', 'd'])];
    const cols = getCollections(plugins, raws);
    const [summary] = getCollectionSummaries(cols);
    expect(summary.previewPlugins).toHaveLength(3);
  });

  it('should preserve pluginCount including plugins beyond preview', () => {
    const plugins = [makePlugin('a'), makePlugin('b'), makePlugin('c'), makePlugin('d')];
    const raws = [makeCollection('col-1', ['a', 'b', 'c', 'd'])];
    const cols = getCollections(plugins, raws);
    const [summary] = getCollectionSummaries(cols);
    expect(summary.pluginCount).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildInstallCommand
// ─────────────────────────────────────────────────────────────────────────────

describe('buildInstallCommand', () => {
  it('should return empty string for empty array', () => {
    expect(buildInstallCommand([])).toBe('');
  });

  it('should return single id for one-element array', () => {
    expect(buildInstallCommand(['jpgc-plancheck'])).toBe('jpgc-plancheck');
  });

  it('should join multiple ids with commas', () => {
    expect(buildInstallCommand(['jpgc-plancheck', 'jpgc-autostop', 'jpgc-synthesis'])).toBe(
      'jpgc-plancheck,jpgc-autostop,jpgc-synthesis'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateCollectionIds — sync-conflict safety
//
// This test ensures that all plugin IDs explicitly listed in collections.json
// still exist in the current plugins_data.json, catching drift introduced by
// the daily sync job removing or renaming upstream plugins.
// ─────────────────────────────────────────────────────────────────────────────

describe('validateCollectionIds (sync-conflict safety)', () => {
  it('all plugin IDs in collections.json must exist in plugins_data.json', () => {
    const missing = validateCollectionIds(
      pluginsData as CollectionPlugin[],
      rawCollectionsData as CollectionRaw[]
    );

    if (missing.length > 0) {
      const details = missing
        .map(({ collectionId, pluginId }) => `  collection "${collectionId}" → missing plugin "${pluginId}"`)
        .join('\n');
      throw new Error(
        `collections.json references plugin IDs that no longer exist in plugins_data.json.\n` +
        `This may be caused by the daily sync job removing or renaming upstream plugins.\n` +
        `Update collections.json to use valid IDs:\n${details}`
      );
    }

    expect(missing).toHaveLength(0);
  });
});
