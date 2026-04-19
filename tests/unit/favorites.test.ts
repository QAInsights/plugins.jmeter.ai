import { describe, it, expect } from 'vitest';
import {
    parseShareParam,
    dedupMerge,
    dedupIds,
    buildShareUrl,
    SHARE_CAP,
} from '../../src/utils/favorites';

describe('parseShareParam', () => {
    it('should return empty array for null', () => {
        expect(parseShareParam(null)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
        expect(parseShareParam(undefined)).toEqual([]);
    });

    it('should return empty array for empty string', () => {
        expect(parseShareParam('')).toEqual([]);
    });

    it('should parse a comma-separated list of IDs', () => {
        expect(parseShareParam('jpgc-graphs-additional,jpgc-tst-editor')).toEqual([
            'jpgc-graphs-additional',
            'jpgc-tst-editor',
        ]);
    });

    it('should trim whitespace from each ID', () => {
        expect(parseShareParam(' id1 , id2 ')).toEqual(['id1', 'id2']);
    });

    it('should deduplicate IDs', () => {
        expect(parseShareParam('a,b,a')).toEqual(['a', 'b']);
    });

    it('should filter out empty segments from trailing commas', () => {
        expect(parseShareParam('a,b,')).toEqual(['a', 'b']);
    });
});

describe('dedupIds', () => {
    it('should remove duplicates while preserving order', () => {
        expect(dedupIds(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('should return empty array for empty input', () => {
        expect(dedupIds([])).toEqual([]);
    });
});

describe('dedupMerge', () => {
    it('should merge two lists and deduplicate', () => {
        expect(dedupMerge(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('should return existing list when incoming is empty', () => {
        expect(dedupMerge(['a', 'b'], [])).toEqual(['a', 'b']);
    });

    it('should return incoming when existing is empty', () => {
        expect(dedupMerge([], ['x', 'y'])).toEqual(['x', 'y']);
    });

    it('should preserve existing order first then new IDs', () => {
        const result = dedupMerge(['c', 'a'], ['a', 'b']);
        expect(result).toEqual(['c', 'a', 'b']);
    });
});

describe('buildShareUrl', () => {
    it('should build a URL with favs param', () => {
        const url = buildShareUrl('https://plugins.jmeter.ai', ['id1', 'id2']);
        expect(url).toBe('https://plugins.jmeter.ai/?favs=id1,id2');
    });

    it('should cap IDs at SHARE_CAP', () => {
        const ids = Array.from({ length: SHARE_CAP + 10 }, (_, i) => `id${i}`);
        const url = buildShareUrl('https://plugins.jmeter.ai', ids);
        const paramPart = url.split('?favs=')[1];
        expect(paramPart.split(',').length).toBe(SHARE_CAP);
    });

    it('should work with a single ID', () => {
        expect(buildShareUrl('https://example.com', ['only'])).toBe('https://example.com/?favs=only');
    });
});
