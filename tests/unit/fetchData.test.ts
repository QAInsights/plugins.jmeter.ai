import { describe, it, expect } from 'vitest';

// Re-implement the pure logic from fetchData.mjs as testable functions.
// This avoids needing HTTP mocking or child-process execution.

function calculateTrending(historyData: Record<string, number> | undefined): number {
  if (!historyData) return 0;
  const dates = Object.keys(historyData).sort();
  if (dates.length < 2) return 0;
  const latestDate = dates[dates.length - 1];
  const previousDate = dates[dates.length - 2];
  const currentDownloads = historyData[latestDate] || 0;
  const previousDownloads = historyData[previousDate] || 0;
  return currentDownloads - previousDownloads;
}

function enrichPlugins(pluginsMeta: any[], pluginsStats: Record<string, Record<string, number>>, overrides: { sponsored?: string[]; aiReady?: string[]; featured?: string[] } = {}) {
  const { sponsored = [], aiReady = [], featured = [] } = overrides;

  // Deduplicate by ID (mirrors the Map logic in fetchData.mjs)
  const uniquePluginsMap = new Map();
  pluginsMeta.forEach((p: any) => uniquePluginsMap.set(p.id, p));
  const uniquePlugins = Array.from(uniquePluginsMap.values());

  const enriched = uniquePlugins.map((plugin: any) => {
    const id = plugin.id;
    const stats = pluginsStats[id] || {};
    const trendingDelta = calculateTrending(stats);

    const dates = Object.keys(stats).sort();
    const absoluteDownloads = dates.length > 0 ? stats[dates[dates.length - 1]] : 0;

    return {
      ...plugin,
      sponsored: sponsored.includes(id),
      isAiReady: aiReady.includes(id),
      isFeatured: featured.includes(id),
      stats: {
        trendingDelta,
        absoluteDownloads,
        history: stats,
      },
    };
  });

  enriched.sort((a: any, b: any) => b.stats.trendingDelta - a.stats.trendingDelta);
  return enriched;
}

describe('calculateTrending', () => {
  it('should return delta = last - previous date values', () => {
    const result = calculateTrending({ '2025-01-01': 1000, '2025-01-08': 1150 });
    expect(result).toBe(150);
  });

  it('should return 0 for single date', () => {
    expect(calculateTrending({ '2025-01-01': 500 })).toBe(0);
  });

  it('should return 0 for empty history', () => {
    expect(calculateTrending(undefined)).toBe(0);
  });

  it('should return 0 for empty object', () => {
    expect(calculateTrending({} as any)).toBe(0);
  });

  it('should handle negative delta', () => {
    expect(calculateTrending({ '2025-01-01': 500, '2025-01-08': 400 })).toBe(-100);
  });

  it('should handle identical values (delta=0)', () => {
    expect(calculateTrending({ '2025-01-01': 500, '2025-01-08': 500 })).toBe(0);
  });

  it('should sort unsorted date keys correctly', () => {
    const result = calculateTrending({
      '2025-03-01': 300,
      '2025-01-01': 100,
      '2025-02-01': 200,
    });
    // latest = 2025-03-01 (300), previous = 2025-02-01 (200) → delta = 100
    expect(result).toBe(100);
  });

  it('should treat missing latest key as 0', () => {
    const result = calculateTrending({ '2025-01-01': 500, '2025-01-08': undefined as any });
    expect(result).toBe(-500);
  });

  it('should treat missing previous key as 0', () => {
    const result = calculateTrending({ '2025-01-01': undefined as any, '2025-01-08': 500 });
    expect(result).toBe(500);
  });
});

describe('enrichPlugins (pipeline logic)', () => {
  function makePlugin(id: string, overrides: Record<string, any> = {}) {
    return {
      id,
      name: `Plugin ${id}`,
      vendor: 'TestVendor',
      description: 'Test',
      componentClasses: ['com.test.Sampler'],
      helpUrl: `https://example.com/${id}`,
      ...overrides,
    };
  }

  it('should deduplicate plugins by id (later repo overwrites)', () => {
    const plugins = [makePlugin('dup', { name: 'First' }), makePlugin('dup', { name: 'Second' })];
    const result = enrichPlugins(plugins, {});
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Second');
  });

  it('should compute trendingDelta from stats', () => {
    const plugins = [makePlugin('p1')];
    const stats = { p1: { '2025-01-01': 100, '2025-01-08': 200 } };
    const result = enrichPlugins(plugins, stats);
    expect(result[0].stats.trendingDelta).toBe(100);
  });

  it('should compute absoluteDownloads as latest chronological value', () => {
    const plugins = [makePlugin('p1')];
    const stats = { p1: { '2024-06-01': 10000, '2025-01-01': 20000, '2024-12-01': 18000 } };
    const result = enrichPlugins(plugins, stats);
    expect(result[0].stats.absoluteDownloads).toBe(20000);
  });

  it('should default to 0 when no stats entry for plugin', () => {
    const plugins = [makePlugin('p1')];
    const result = enrichPlugins(plugins, {});
    expect(result[0].stats.trendingDelta).toBe(0);
    expect(result[0].stats.absoluteDownloads).toBe(0);
  });

  it('should enrich with sponsored, isAiReady, isFeatured flags', () => {
    const plugins = [makePlugin('a'), makePlugin('b')];
    const stats = {
      a: { '2025-01-01': 100, '2025-01-08': 200 },
      b: { '2025-01-01': 50, '2025-01-08': 80 },
    };
    const result = enrichPlugins(plugins, stats, {
      sponsored: ['a'],
      aiReady: ['b'],
      featured: ['a'],
    });
    const a = result.find((p: any) => p.id === 'a');
    const b = result.find((p: any) => p.id === 'b');
    expect(a.sponsored).toBe(true);
    expect(a.isFeatured).toBe(true);
    expect(a.isAiReady).toBe(false);
    expect(b.isAiReady).toBe(true);
    expect(b.sponsored).toBe(false);
    expect(b.isFeatured).toBe(false);
  });

  it('should ignore override ids that do not match any plugin', () => {
    const plugins = [makePlugin('exists')];
    const result = enrichPlugins(plugins, {}, {
      sponsored: ['nonexistent'],
      aiReady: ['nonexistent'],
      featured: ['nonexistent'],
    });
    expect(result[0].sponsored).toBe(false);
    expect(result[0].isAiReady).toBe(false);
    expect(result[0].isFeatured).toBe(false);
  });

  it('should handle empty override arrays', () => {
    const plugins = [makePlugin('p1')];
    const result = enrichPlugins(plugins, {}, { sponsored: [], aiReady: [], featured: [] });
    expect(result[0].sponsored).toBe(false);
    expect(result[0].isAiReady).toBe(false);
    expect(result[0].isFeatured).toBe(false);
  });

  it('should handle no overrides provided', () => {
    const plugins = [makePlugin('p1')];
    const result = enrichPlugins(plugins, {});
    expect(result[0].sponsored).toBe(false);
    expect(result[0].isAiReady).toBe(false);
    expect(result[0].isFeatured).toBe(false);
  });

  it('should sort by trendingDelta descending', () => {
    const plugins = [makePlugin('high'), makePlugin('low'), makePlugin('mid')];
    const stats = {
      high: { '2025-01-01': 100, '2025-01-08': 500 },
      low: { '2025-01-01': 100, '2025-01-08': 110 },
      mid: { '2025-01-01': 100, '2025-01-08': 300 },
    };
    const result = enrichPlugins(plugins, stats);
    expect(result[0].id).toBe('high');
    expect(result[1].id).toBe('mid');
    expect(result[2].id).toBe('low');
  });

  it('should handle empty plugins array', () => {
    const result = enrichPlugins([], {});
    expect(result).toEqual([]);
  });

  it('should include history in stats', () => {
    const plugins = [makePlugin('p1')];
    const history = { '2025-01-01': 100, '2025-01-08': 200 };
    const result = enrichPlugins(plugins, { p1: history });
    expect(result[0].stats.history).toEqual(history);
  });
});
