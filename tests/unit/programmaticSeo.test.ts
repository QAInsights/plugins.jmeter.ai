import { describe, it, expect } from 'vitest';
import {
  categoryToSlug,
  getAlternativesForPlugin,
  getCategorySummaries,
  getTopComparisonPairs,
  type ProgrammaticPlugin,
} from '../../src/utils/programmaticSeo';

const plugins: ProgrammaticPlugin[] = [
  {
    id: 'p-listener-1',
    name: 'Listener One',
    vendor: 'Vendor A',
    description: 'First listener',
    componentClasses: ['org.example.MyListener'],
    stats: { absoluteDownloads: 500000 },
    githubInfo: { health: { score: 80, label: 'Active' } },
  },
  {
    id: 'p-listener-2',
    name: 'Listener Two',
    vendor: 'Vendor B',
    description: 'Second listener',
    componentClasses: ['org.example.OtherListener'],
    stats: { absoluteDownloads: 300000 },
    githubInfo: { health: { score: 70, label: 'Maintained' } },
  },
  {
    id: 'p-listener-archived',
    name: 'Old Listener',
    vendor: 'Vendor C',
    description: 'Archived listener',
    componentClasses: ['org.example.OldListener'],
    stats: { absoluteDownloads: 900000 },
    githubInfo: { health: { score: 15, label: 'Archived' } },
  },
];

describe('programmaticSeo helpers', () => {
  it('maps categories to clean slugs', () => {
    expect(categoryToSlug('Listeners')).toBe('listeners');
    expect(categoryToSlug('Others')).toBe('thread-groups-and-utilities');
  });

  it('builds category summaries sorted by downloads', () => {
    const summaries = getCategorySummaries(plugins);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].slug).toBe('listeners');
    expect(summaries[0].pluginCount).toBe(3);
    expect(summaries[0].totalDownloads).toBe(1700000);
  });

  it('prioritizes non-archived alternatives ahead of archived ones', () => {
    const alts = getAlternativesForPlugin(plugins[0], plugins);
    expect(alts.map((a) => a.id)).toEqual(['p-listener-2', 'p-listener-archived']);
  });

  it('returns empty alternatives for catch-all Others plugins', () => {
    const othersPlugins: ProgrammaticPlugin[] = [
      {
        id: 'jpgc-casutg',
        name: 'Custom Thread Groups',
        vendor: 'jmeter-plugins.org',
        description: 'Thread groups',
        stats: { absoluteDownloads: 1850000 },
      },
      {
        id: 'jpgc-plugins-manager',
        name: 'Plugins Manager',
        vendor: 'jmeter-plugins.org',
        description: 'Installs plugins',
        stats: { absoluteDownloads: 3000000 },
      },
    ];
    expect(getAlternativesForPlugin(othersPlugins[0], othersPlugins)).toEqual([]);
    expect(getTopComparisonPairs(othersPlugins, 10)).toEqual([]);
  });

  it('generates canonical deduplicated comparison pairs', () => {
    const pairs = getTopComparisonPairs(plugins, 10);
    expect(pairs).toHaveLength(3);
    expect(pairs[0].slug).toBe('p-listener-1-vs-p-listener-archived');
  });
});
