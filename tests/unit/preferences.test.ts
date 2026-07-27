import { describe, it, expect } from 'vitest';
import {
  normalizePreferences,
  resolveTheme,
  isTheme,
  DEFAULT_PREFERENCES,
  THEME_OPTIONS,
  CATEGORY_OPTIONS,
  SORT_OPTIONS,
} from '../../src/utils/preferences';

describe('normalizePreferences', () => {
  it('should return defaults for null', () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });

  it('should return defaults for undefined', () => {
    expect(normalizePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
  });

  it('should return defaults for a non-object', () => {
    expect(normalizePreferences('dark')).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences(42)).toEqual(DEFAULT_PREFERENCES);
  });

  it('should return defaults for an empty object', () => {
    expect(normalizePreferences({})).toEqual(DEFAULT_PREFERENCES);
  });

  it('should preserve fully valid values', () => {
    const input = { theme: 'dark', defaultCategory: 'samplers', defaultSort: 'name-asc' };
    expect(normalizePreferences(input)).toEqual(input);
  });

  it('should substitute an invalid theme with the default', () => {
    const result = normalizePreferences({ theme: 'neon' });
    expect(result.theme).toBe(DEFAULT_PREFERENCES.theme);
  });

  it('should substitute an invalid category with the default', () => {
    const result = normalizePreferences({ defaultCategory: 'gizmos' });
    expect(result.defaultCategory).toBe(DEFAULT_PREFERENCES.defaultCategory);
  });

  it('should substitute an invalid sort with the default', () => {
    const result = normalizePreferences({ defaultSort: 'random' });
    expect(result.defaultSort).toBe(DEFAULT_PREFERENCES.defaultSort);
  });

  it('should keep valid fields while fixing invalid ones', () => {
    const result = normalizePreferences({ theme: 'light', defaultCategory: 'bogus' });
    expect(result.theme).toBe('light');
    expect(result.defaultCategory).toBe(DEFAULT_PREFERENCES.defaultCategory);
    expect(result.defaultSort).toBe(DEFAULT_PREFERENCES.defaultSort);
  });

  it('should accept the system theme', () => {
    expect(normalizePreferences({ theme: 'system' }).theme).toBe('system');
  });

  it('should ignore unknown extra keys from a stale blob', () => {
    const result = normalizePreferences({
      theme: 'dark',
      defaultCategory: 'timers',
      extraKey: 'foo',
    });
    expect(result).toEqual({
      theme: 'dark',
      defaultCategory: 'timers',
      defaultSort: DEFAULT_PREFERENCES.defaultSort,
    });
    expect(result).not.toHaveProperty('extraKey');
  });
});

describe('resolveTheme', () => {
  it('should return light for an explicit light preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('should return dark for an explicit dark preference', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('should follow the system scheme when preference is system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('isTheme', () => {
  it('should accept valid themes', () => {
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('system')).toBe(true);
  });

  it('should reject invalid values', () => {
    expect(isTheme('neon')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(123)).toBe(false);
  });
});

describe('option constants', () => {
  it('should have a default that matches a valid option in each list', () => {
    expect(THEME_OPTIONS.some((o) => o.value === DEFAULT_PREFERENCES.theme)).toBe(true);
    expect(CATEGORY_OPTIONS.some((o) => o.value === DEFAULT_PREFERENCES.defaultCategory)).toBe(
      true,
    );
    expect(SORT_OPTIONS.some((o) => o.value === DEFAULT_PREFERENCES.defaultSort)).toBe(true);
  });

  it('should expose the category values consumed by index.astro', () => {
    const values = CATEGORY_OPTIONS.map((o) => o.value);
    expect(values).toContain('all');
    expect(values).toContain('samplers');
    expect(values).toContain('others');
  });

  it('should expose the sort values consumed by index.astro', () => {
    const values = SORT_OPTIONS.map((o) => o.value);
    expect(values).toContain('relevance');
    expect(values).toContain('downloads-desc');
    expect(values).toContain('ai-ready');
  });
});
