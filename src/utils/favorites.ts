/**
 * Pure utility helpers for the Favorites / Bookmarks feature.
 * All functions are side-effect free and safe to call during SSR.
 */

/** Maximum number of IDs encoded in a share URL to keep URLs reasonable. */
export const SHARE_CAP = 100;

/**
 * Parse a raw `?favs=` query-param string into a deduplicated array of IDs.
 * Returns an empty array for null, empty, or malformed input.
 */
export function parseShareParam(raw: string | null | undefined): string[] {
    if (!raw) return [];
    return dedupIds(
        raw.split(',').map(s => s.trim()).filter(Boolean)
    );
}

/**
 * Merge two lists of IDs, deduplicating and preserving order (existing first).
 * The result is capped at {@link SHARE_CAP} items when used for URL building.
 */
export function dedupMerge(existing: string[], incoming: string[]): string[] {
    return dedupIds([...existing, ...incoming]);
}

/**
 * Remove duplicate IDs while preserving insertion order.
 */
export function dedupIds(ids: string[]): string[] {
    return [...new Set(ids)];
}

/**
 * Build a share URL string containing up to {@link SHARE_CAP} favorite IDs.
 * @param baseUrl - The base URL (e.g. `https://plugins.jmeter.ai`).
 * @param ids     - The list of favorite plugin IDs.
 */
export function buildShareUrl(baseUrl: string, ids: string[]): string {
    const capped = ids.slice(0, SHARE_CAP);
    return `${baseUrl}/?favs=${capped.join(',')}`;
}
