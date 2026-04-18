import { describe, it, expect, vi } from 'vitest';
import { getReadingTime, sortPosts, filterDrafts } from '../../src/utils/blog';

describe('getReadingTime', () => {
  it('should return "1 min read" for 200 words', () => {
    const content = Array(200).fill('word').join(' ');
    expect(getReadingTime(content)).toBe('1 min read');
  });

  it('should return "2 min read" for 201 words (rounds up)', () => {
    const content = Array(201).fill('word').join(' ');
    expect(getReadingTime(content)).toBe('2 min read');
  });

  it('should return "1 min read" for a single word', () => {
    expect(getReadingTime('hello')).toBe('1 min read');
  });

  it('should return "1 min read" for empty string', () => {
    expect(getReadingTime('')).toBe('1 min read');
  });

  it('should return "1 min read" for whitespace-only string', () => {
    expect(getReadingTime('   \t  ')).toBe('1 min read');
  });

  it('should handle newlines and tabs as separators', () => {
    const content = Array(200).fill('word').join('\n');
    expect(getReadingTime(content)).toBe('1 min read');
  });

  it('should handle large input (10000 words)', () => {
    const content = Array(10000).fill('word').join(' ');
    expect(getReadingTime(content)).toBe('50 min read');
  });

  it('should handle unicode words', () => {
    const content = Array(200).fill('こんにちは').join(' ');
    expect(getReadingTime(content)).toBe('1 min read');
  });

  it('should handle mixed whitespace', () => {
    const content = 'word\t\n  word\r\nword';
    expect(getReadingTime(content)).toBe('1 min read');
  });
});

describe('sortPosts', () => {
  const makePost = (dateStr: string) => ({
    data: { pubDate: new Date(dateStr) },
  });

  it('should sort posts descending by pubDate', () => {
    const posts = [makePost('2025-01-01'), makePost('2025-06-15'), makePost('2025-03-10')];
    const sorted = sortPosts(posts);
    expect(sorted[0].data.pubDate).toEqual(new Date('2025-06-15'));
    expect(sorted[1].data.pubDate).toEqual(new Date('2025-03-10'));
    expect(sorted[2].data.pubDate).toEqual(new Date('2025-01-01'));
  });

  it('should return empty array for empty input', () => {
    expect(sortPosts([])).toEqual([]);
  });

  it('should handle single item', () => {
    const posts = [makePost('2025-01-01')];
    expect(sortPosts(posts)).toHaveLength(1);
  });

  it('should handle equal dates', () => {
    const posts = [makePost('2025-01-01'), makePost('2025-01-01')];
    const sorted = sortPosts(posts);
    expect(sorted).toHaveLength(2);
  });

  it('should mutate the input array', () => {
    const posts = [makePost('2025-01-01'), makePost('2025-06-15')];
    const result = sortPosts(posts);
    // Array.sort is in-place, so result === posts
    expect(result).toBe(posts);
  });

  it('should handle pre-sorted input', () => {
    const posts = [makePost('2025-06-15'), makePost('2025-01-01')];
    const sorted = sortPosts([...posts]);
    expect(sorted[0].data.pubDate >= sorted[1].data.pubDate).toBe(true);
  });
});

describe('filterDrafts', () => {
  const makePost = (draft: boolean) => ({ data: { draft } });

  it('should filter out drafts in PROD mode', () => {
    vi.stubEnv('PROD', true);
    const posts = [makePost(true), makePost(false), makePost(true)];
    const filtered = filterDrafts(posts);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].data.draft).toBe(false);
    vi.unstubAllEnvs();
  });

  it('should return all posts in dev mode', () => {
    vi.stubEnv('PROD', false);
    const posts = [makePost(true), makePost(false), makePost(true)];
    const filtered = filterDrafts(posts);
    expect(filtered).toHaveLength(3);
    vi.unstubAllEnvs();
  });

  it('should return all posts when PROD is undefined', () => {
    vi.stubEnv('PROD', '' as any);
    const posts = [makePost(true), makePost(false)];
    const filtered = filterDrafts(posts);
    expect(filtered).toHaveLength(2);
    vi.unstubAllEnvs();
  });

  it('should handle empty array', () => {
    vi.stubEnv('PROD', true);
    expect(filterDrafts([])).toEqual([]);
    vi.unstubAllEnvs();
  });

  it('should handle all drafts in PROD', () => {
    vi.stubEnv('PROD', true);
    const posts = [makePost(true), makePost(true)];
    expect(filterDrafts(posts)).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it('should handle no drafts in PROD', () => {
    vi.stubEnv('PROD', true);
    const posts = [makePost(false), makePost(false)];
    expect(filterDrafts(posts)).toHaveLength(2);
    vi.unstubAllEnvs();
  });

  it('should handle posts without draft field in PROD', () => {
    vi.stubEnv('PROD', true);
    const posts = [{ data: {} }, { data: { draft: true } }];
    // post.data.draft is undefined => falsy => not filtered
    const filtered = filterDrafts(posts as any);
    expect(filtered).toHaveLength(1);
    vi.unstubAllEnvs();
  });
});
