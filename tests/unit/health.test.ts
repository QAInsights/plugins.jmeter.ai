import { describe, it, expect } from 'vitest';
import {
  parseGitHubRepo,
  computeHealth,
  enrichPluginWithHealth,
  type GitHubSignals,
} from '../../src/utils/health';

describe('parseGitHubRepo', () => {
  it('should parse standard GitHub URLs', () => {
    expect(parseGitHubRepo('https://github.com/undera/jmeter-plugins')).toEqual({
      owner: 'undera',
      repo: 'jmeter-plugins',
    });
  });

  it('should handle .git extension', () => {
    expect(parseGitHubRepo('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('should handle http and www prefixes', () => {
    expect(parseGitHubRepo('http://www.github.com/owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('should handle deep path URLs (blob/master, wiki, issues)', () => {
    expect(parseGitHubRepo('https://github.com/owner/repo/blob/master/README.md')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
    expect(parseGitHubRepo('https://github.com/owner/repo/wiki/SomePage')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
    expect(parseGitHubRepo('https://github.com/owner/repo/issues')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('should return null for non-GitHub URLs', () => {
    expect(parseGitHubRepo('https://gitlab.com/owner/repo')).toBeNull();
    expect(parseGitHubRepo('https://example.com')).toBeNull();
    expect(parseGitHubRepo('')).toBeNull();
    expect(parseGitHubRepo(null)).toBeNull();
    expect(parseGitHubRepo(undefined)).toBeNull();
  });

  it('should return null for invalid URLs', () => {
    expect(parseGitHubRepo('not-a-url')).toBeNull();
    expect(parseGitHubRepo('https://github.com/')).toBeNull();
  });
});

describe('computeHealth', () => {
  const baseNow = new Date('2026-07-03T12:00:00Z');

  it('should return Unknown for empty or null signals', () => {
    const health = computeHealth(null, baseNow);
    expect(health.label).toBe('Unknown');
    expect(health.score).toBe(0);

    const healthEmpty = computeHealth({}, baseNow);
    expect(healthEmpty.label).toBe('Unknown');
    expect(healthEmpty.score).toBe(0);
  });

  it('should score an Active repository highly', () => {
    const signals: GitHubSignals = {
      stars: 600,
      openIssues: 5,
      pushedAt: '2026-07-01T12:00:00Z', // 2 days ago
      latestReleaseAt: '2026-06-15T12:00:00Z', // 18 days ago
      license: 'Apache-2.0',
    };
    const health = computeHealth(signals, baseNow);
    expect(health.label).toBe('Active');
    expect(health.score).toBeGreaterThanOrEqual(70);
  });

  it('should classify a moderately maintained repo as Maintained', () => {
    const signals: GitHubSignals = {
      stars: 20,
      openIssues: 5,
      pushedAt: '2025-10-03T12:00:00Z', // ~9 months ago
      latestReleaseAt: '2025-07-03T12:00:00Z', // ~12 months ago
      license: 'MIT',
    };
    const health = computeHealth(signals, baseNow);
    expect(health.label).toBe('Maintained');
    expect(health.score).toBeGreaterThanOrEqual(40);
    expect(health.score).toBeLessThan(70);
  });

  it('should classify an old repo as Stale', () => {
    const signals: GitHubSignals = {
      stars: 5,
      openIssues: 10, // high issue ratio
      pushedAt: '2024-01-01T12:00:00Z', // >2 years ago
      latestReleaseAt: '2023-01-01T12:00:00Z',
    };
    const health = computeHealth(signals, baseNow);
    expect(health.label).toBe('Stale');
    expect(health.score).toBeLessThan(40);
  });

  it('should handle archived override and cap score at 20', () => {
    const signals: GitHubSignals = {
      stars: 1000,
      openIssues: 0,
      pushedAt: '2026-07-02T12:00:00Z',
      latestReleaseAt: '2026-07-02T12:00:00Z',
      archived: true,
    };
    const health = computeHealth(signals, baseNow);
    expect(health.label).toBe('Archived');
    expect(health.score).toBeLessThanOrEqual(20);
    expect(health.archived).toBe(true);
  });

  it('should treat missing dates as ancient', () => {
    const signals: GitHubSignals = {
      stars: 10,
      openIssues: 1,
    };
    const health = computeHealth(signals, baseNow);
    // No pushed date -> recency is 0. No release date -> release is 0.
    // Stars score for 10 is low (~9.6 pts), burden score is ~8 pts.
    // Total should be around 18 -> Stale.
    expect(health.label).toBe('Stale');
    expect(health.score).toBeLessThan(30);
  });

  it('should saturate stars score above 500 stars', () => {
    const signals500: GitHubSignals = {
      stars: 500,
      pushedAt: '2026-07-03T12:00:00Z',
    };
    const signals1000: GitHubSignals = {
      stars: 1000,
      pushedAt: '2026-07-03T12:00:00Z',
    };
    const health500 = computeHealth(signals500, baseNow);
    const health1000 = computeHealth(signals1000, baseNow);
    // Since stars is >= 500, stars score is capped/saturated.
    // So both should end up with the same total score if other factors are default.
    expect(health500.score).toBe(health1000.score);
  });
});

describe('enrichPluginWithHealth', () => {
  it('should return plugin unchanged if health is undefined or label is Unknown', () => {
    const plugin = { id: 'test', name: 'Test' };
    expect(enrichPluginWithHealth(plugin, undefined)).toEqual(plugin);

    const unknownHealth = computeHealth(null);
    expect(enrichPluginWithHealth(plugin, unknownHealth)).toEqual(plugin);
  });

  it('should add githubInfo when valid health info is provided', () => {
    const plugin = { id: 'test', name: 'Test' };
    const health = computeHealth({
      stars: 100,
      license: 'MIT',
      pushedAt: '2026-07-01T12:00:00Z',
    }, new Date('2026-07-03T12:00:00Z'));

    const enriched = enrichPluginWithHealth(plugin, health);
    expect(enriched).toHaveProperty('githubInfo');
    expect(enriched.githubInfo?.stars).toBe(100);
    expect(enriched.githubInfo?.license).toBe('MIT');
    expect(enriched.githubInfo?.health.score).toBeGreaterThan(0);
  });
});
