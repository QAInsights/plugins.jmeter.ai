/**
 * Pure utility helpers for user Preferences (theme + discovery defaults).
 * All functions are side-effect free and safe to call during SSR. Storage I/O
 * lives in PreferencesManager.astro, mirroring the favorites.ts /
 * FavoritesManager.astro split.
 */

/** localStorage key for the JSON preferences blob. */
export const PREFS_STORAGE_KEY = 'perfatlas:prefs';

/** Legacy key written by the old header theme toggle. Read once for migration. */
export const LEGACY_THEME_KEY = 'theme';

export interface ThemeOption {
  value: 'light' | 'dark' | 'system';
  label: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export type ThemePreference = ThemeOption['value'];

export interface CategoryOption {
  value: string;
  label: string;
}

/** Canonical category filter values. Must match `data-filter` on index.astro. */
export const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: 'all', label: 'All' },
  { value: 'assertions', label: 'Assertions' },
  { value: 'listeners', label: 'Listeners' },
  { value: 'samplers', label: 'Samplers' },
  { value: 'configs', label: 'Configs' },
  { value: 'timers', label: 'Timers' },
  { value: 'processors', label: 'Processors' },
  { value: 'others', label: 'Others' },
];

export interface SortOption {
  value: string;
  label: string;
}

/** Canonical sort values. Must match the <option> values on index.astro. */
export const SORT_OPTIONS: SortOption[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'downloads-desc', label: 'Downloads: High to Low' },
  { value: 'trending-desc', label: 'Trending: High to Low' },
  { value: 'name-asc', label: 'Name: A to Z' },
  { value: 'ai-ready', label: 'AI Ready First' },
];

export interface Preferences {
  theme: ThemePreference;
  defaultCategory: string;
  defaultSort: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  defaultCategory: 'all',
  defaultSort: 'relevance',
};

function oneOf<T extends string>(
  value: unknown,
  options: ReadonlyArray<{ value: T }>,
  fallback: T,
): T {
  return options.some((o) => o.value === value) ? (value as T) : fallback;
}

/** Type guard for a valid theme preference. */
export function isTheme(value: unknown): value is ThemePreference {
  return THEME_OPTIONS.some((o) => o.value === value);
}

/**
 * Coerce an arbitrary parsed value (possibly partial, stale, or malformed)
 * into a fully valid Preferences object, substituting defaults per field.
 */
export function normalizePreferences(raw: unknown): Preferences {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    theme: oneOf(obj.theme, THEME_OPTIONS, DEFAULT_PREFERENCES.theme),
    defaultCategory: oneOf(
      obj.defaultCategory,
      CATEGORY_OPTIONS,
      DEFAULT_PREFERENCES.defaultCategory,
    ),
    defaultSort: oneOf(obj.defaultSort, SORT_OPTIONS, DEFAULT_PREFERENCES.defaultSort),
  };
}

/**
 * Resolve a theme preference to a concrete 'light' | 'dark', consulting the
 * system color scheme only when the preference is 'system'.
 */
export function resolveTheme(theme: ThemePreference, systemPrefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light';
  return theme;
}
