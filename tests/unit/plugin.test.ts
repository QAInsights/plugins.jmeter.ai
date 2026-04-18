import { describe, it, expect } from 'vitest';
import { inferCategory, getRelatedPlugins, type PluginLike } from '../../src/utils/plugin';

const makePlugin = (overrides: Partial<PluginLike> & { id: string }): PluginLike => ({
  vendor: 'Acme',
  componentClasses: [],
  stats: { absoluteDownloads: 0 },
  ...overrides,
});

describe('inferCategory', () => {
  it('returns Assertions when a component class references an assertion', () => {
    expect(
      inferCategory(makePlugin({ id: 'a', componentClasses: ['com.foo.MyAssertionGui'] }))
    ).toBe('Assertions');
  });

  it('returns Listeners when a component class references a listener', () => {
    expect(
      inferCategory(makePlugin({ id: 'a', componentClasses: ['com.foo.ResultListener'] }))
    ).toBe('Listeners');
  });

  it('returns Listeners when a component class references a visualizer', () => {
    expect(
      inferCategory(makePlugin({ id: 'a', componentClasses: ['com.foo.GraphVisualizer'] }))
    ).toBe('Listeners');
  });

  it('returns Samplers when a component class references a sampler', () => {
    expect(
      inferCategory(makePlugin({ id: 'a', componentClasses: ['com.foo.HttpSampler'] }))
    ).toBe('Samplers');
  });

  it('returns Configs when a component class references a config element', () => {
    expect(
      inferCategory(makePlugin({ id: 'a', componentClasses: ['com.foo.HeaderConfigGui'] }))
    ).toBe('Configs');
  });

  it('returns Timers when a component class references a timer', () => {
    expect(
      inferCategory(makePlugin({ id: 'a', componentClasses: ['com.foo.ConstantTimer'] }))
    ).toBe('Timers');
  });

  it('returns Processors when a component class references a processor', () => {
    expect(
      inferCategory(makePlugin({ id: 'a', componentClasses: ['com.foo.PreProcessor'] }))
    ).toBe('Processors');
  });

  it('returns Others when no keyword matches', () => {
    expect(
      inferCategory(makePlugin({ id: 'a', componentClasses: ['com.foo.Thingamajig'] }))
    ).toBe('Others');
  });

  it('returns Others when componentClasses is missing', () => {
    expect(inferCategory(makePlugin({ id: 'a', componentClasses: undefined }))).toBe('Others');
  });

  it('returns Others when componentClasses is empty', () => {
    expect(inferCategory(makePlugin({ id: 'a', componentClasses: [] }))).toBe('Others');
  });

  it('prioritises assertion over other matches when multiple classes are present', () => {
    expect(
      inferCategory(
        makePlugin({
          id: 'a',
          componentClasses: ['com.foo.HttpSampler', 'com.foo.ResponseAssertion'],
        })
      )
    ).toBe('Assertions');
  });
});

describe('getRelatedPlugins', () => {
  const current = makePlugin({
    id: 'current',
    vendor: 'Acme',
    componentClasses: ['com.foo.HttpSampler'],
    stats: { absoluteDownloads: 100 },
  });

  it('excludes the current plugin from both lists', () => {
    const all = [
      current,
      makePlugin({ id: 'a', vendor: 'Acme', componentClasses: ['com.foo.OtherSampler'] }),
    ];
    const { sameVendor, sameCategory } = getRelatedPlugins(current, all);
    expect(sameVendor.find((p) => p.id === 'current')).toBeUndefined();
    expect(sameCategory.find((p) => p.id === 'current')).toBeUndefined();
  });

  it('returns same-vendor plugins sorted by downloads desc and capped at limit', () => {
    const all = [
      current,
      makePlugin({ id: 'v1', vendor: 'Acme', stats: { absoluteDownloads: 50 } }),
      makePlugin({ id: 'v2', vendor: 'Acme', stats: { absoluteDownloads: 500 } }),
      makePlugin({ id: 'v3', vendor: 'Acme', stats: { absoluteDownloads: 200 } }),
      makePlugin({ id: 'v4', vendor: 'Acme', stats: { absoluteDownloads: 10 } }),
      makePlugin({ id: 'w1', vendor: 'Other', stats: { absoluteDownloads: 999 } }),
    ];
    const { sameVendor } = getRelatedPlugins(current, all, { limit: 3 });
    expect(sameVendor.map((p) => p.id)).toEqual(['v2', 'v3', 'v1']);
  });

  it('deduplicates: plugins already in sameVendor are not repeated in sameCategory', () => {
    const all = [
      current,
      makePlugin({
        id: 'shared',
        vendor: 'Acme',
        componentClasses: ['com.foo.OtherSampler'],
        stats: { absoluteDownloads: 300 },
      }),
      makePlugin({
        id: 'cat-only',
        vendor: 'Bravo',
        componentClasses: ['com.foo.SomeSampler'],
        stats: { absoluteDownloads: 250 },
      }),
    ];
    const { sameVendor, sameCategory } = getRelatedPlugins(current, all);
    expect(sameVendor.map((p) => p.id)).toContain('shared');
    expect(sameCategory.map((p) => p.id)).not.toContain('shared');
    expect(sameCategory.map((p) => p.id)).toEqual(['cat-only']);
  });

  it('returns empty sameCategory when current plugin category is Others', () => {
    const otherCurrent = makePlugin({
      id: 'cur',
      vendor: 'Acme',
      componentClasses: ['com.foo.Unknown'],
    });
    const all = [
      otherCurrent,
      makePlugin({
        id: 'x',
        vendor: 'Bravo',
        componentClasses: ['com.foo.AlsoUnknown'],
        stats: { absoluteDownloads: 10 },
      }),
    ];
    const { sameCategory } = getRelatedPlugins(otherCurrent, all);
    expect(sameCategory).toEqual([]);
  });

  it('returns empty sameVendor when current plugin has no vendor', () => {
    const noVendor: PluginLike = {
      id: 'cur',
      vendor: undefined,
      componentClasses: ['com.foo.HttpSampler'],
      stats: { absoluteDownloads: 1 },
    };
    const all = [
      noVendor,
      makePlugin({ id: 'v1', vendor: 'Acme', componentClasses: ['com.foo.HttpSampler'] }),
    ];
    const { sameVendor, sameCategory } = getRelatedPlugins(noVendor, all);
    expect(sameVendor).toEqual([]);
    expect(sameCategory.map((p) => p.id)).toEqual(['v1']);
  });

  it('honors a custom limit', () => {
    const all = [
      current,
      makePlugin({ id: 'v1', vendor: 'Acme', stats: { absoluteDownloads: 1 } }),
      makePlugin({ id: 'v2', vendor: 'Acme', stats: { absoluteDownloads: 2 } }),
      makePlugin({ id: 'v3', vendor: 'Acme', stats: { absoluteDownloads: 3 } }),
    ];
    const { sameVendor } = getRelatedPlugins(current, all, { limit: 2 });
    expect(sameVendor).toHaveLength(2);
    expect(sameVendor.map((p) => p.id)).toEqual(['v3', 'v2']);
  });

  it('returns empty results when the plugins list is not an array', () => {
    // @ts-expect-error intentional bad input
    const result = getRelatedPlugins(current, null);
    expect(result).toEqual({ sameVendor: [], sameCategory: [] });
  });

  it('treats missing absoluteDownloads as zero when sorting', () => {
    const all = [
      current,
      makePlugin({ id: 'v1', vendor: 'Acme', stats: undefined as any }),
      makePlugin({ id: 'v2', vendor: 'Acme', stats: { absoluteDownloads: 5 } }),
    ];
    const { sameVendor } = getRelatedPlugins(current, all);
    expect(sameVendor[0].id).toBe('v2');
  });
});
