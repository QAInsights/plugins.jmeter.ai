import { describe, it, expect } from 'vitest';
import {
  findPluginsMentionedInPost,
  findPostsForPlugin,
  getPrevNextPosts,
  getRelatedPosts,
  type BlogPostLike,
  type CrossLinkPlugin,
} from '../../src/utils/crossLink';

const samplePosts: BlogPostLike[] = [
  {
    id: 'post-newest',
    body: 'Using jpgc-perfmon for server monitoring.',
    data: {
      title: 'PerfMon Guide',
      description: 'Monitor servers with PerfMon.',
      pubDate: new Date('2026-10-10'),
      tags: ['JMeter', 'PerfMon', 'Monitoring'],
    },
  },
  {
    id: 'post-middle',
    body: 'Compare Throughput Shaping Timer and jpgc-casutg.',
    data: {
      title: 'Shaping Load',
      description: 'Control RPS with JMeter.',
      pubDate: new Date('2026-09-10'),
      tags: ['JMeter', 'Load Testing'],
    },
  },
  {
    id: 'post-oldest',
    body: 'Monitoring metrics with Prometheus.',
    data: {
      title: 'Prometheus Guide',
      description: 'Stream metrics.',
      pubDate: new Date('2026-08-10'),
      tags: ['JMeter', 'Monitoring'],
    },
  },
];

const samplePlugins: CrossLinkPlugin[] = [
  {
    id: 'jpgc-perfmon',
    name: 'PerfMon Server Performance Monitoring',
    vendor: 'jmeter-plugins.org',
    description: 'Server monitoring',
    stats: { absoluteDownloads: 1400000 },
  },
  {
    id: 'jpgc-tst',
    name: 'Throughput Shaping Timer',
    vendor: 'jmeter-plugins.org',
    description: 'RPS shaping',
    stats: { absoluteDownloads: 1150000 },
  },
  {
    id: 'jpgc-casutg',
    name: 'Custom Thread Groups',
    vendor: 'jmeter-plugins.org',
    description: 'Thread groups',
    stats: { absoluteDownloads: 1850000 },
  },
];

describe('crossLink helpers', () => {
  it('ranks related posts by tag overlap then recency', () => {
    const related = getRelatedPosts(samplePosts[0], samplePosts, 2);
    expect(related.map((p) => p.id)).toEqual(['post-oldest', 'post-middle']);
  });

  it('computes prev (older) and next (newer) posts', () => {
    const mid = getPrevNextPosts(samplePosts[1], samplePosts);
    expect(mid.next?.id).toBe('post-newest');
    expect(mid.prev?.id).toBe('post-oldest');

    const newest = getPrevNextPosts(samplePosts[0], samplePosts);
    expect(newest.next).toBeNull();
    expect(newest.prev?.id).toBe('post-middle');
  });

  it('finds plugins mentioned by ID or full name sorted by downloads', () => {
    const mentioned = findPluginsMentionedInPost(samplePosts[1], samplePlugins);
    expect(mentioned.map((p) => p.id)).toEqual(['jpgc-casutg', 'jpgc-tst']);
  });

  it('finds matching blog posts for a plugin', () => {
    const posts = findPostsForPlugin(samplePlugins[0], samplePosts);
    expect(posts.map((p) => p.id)).toEqual(['post-newest']);
  });

  it('matches catalog PerfMon plugin against PerfMon Metrics Collector tutorial wording', () => {
    const perfmonCatalog: CrossLinkPlugin = {
      id: 'jpgc-perfmon',
      name: 'PerfMon (Servers Performance Monitoring)',
      vendor: 'jmeter-plugins.org',
      description: 'Server monitoring',
      stats: { absoluteDownloads: 1400000 },
    };
    const tutorial: BlogPostLike = {
      id: 'perfmon-guide',
      body: 'Add the PerfMon Metrics Collector listener to monitor CPU and memory.',
      data: {
        title: 'How to Use JMeter PerfMon Plugin',
        description: 'Monitor server CPU and memory with PerfMon Metrics Collector.',
        pubDate: new Date('2026-10-15'),
      },
    };
    expect(findPluginsMentionedInPost(tutorial, [perfmonCatalog]).map((p) => p.id)).toEqual([
      'jpgc-perfmon',
    ]);
    expect(findPostsForPlugin(perfmonCatalog, [tutorial]).map((p) => p.id)).toEqual([
      'perfmon-guide',
    ]);
  });
});
