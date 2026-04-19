import { describe, it, expect } from 'vitest';
import {
  escapeXml,
  wrapText,
  formatDownloads,
  buildPluginOgSvg,
  stripHtml,
  OG_WIDTH,
  OG_HEIGHT,
} from '../../src/utils/og';

describe('escapeXml', () => {
  it('escapes the five XML special characters', () => {
    expect(escapeXml(`<tag attr="v">O'Brien & co</tag>`)).toBe(
      '&lt;tag attr=&quot;v&quot;&gt;O&apos;Brien &amp; co&lt;/tag&gt;'
    );
  });

  it('returns an empty string unchanged', () => {
    expect(escapeXml('')).toBe('');
  });

  it('preserves already-safe strings', () => {
    expect(escapeXml('Hello World 123')).toBe('Hello World 123');
  });
});

describe('wrapText', () => {
  it('returns empty array for empty, whitespace, or zero-budget input', () => {
    expect(wrapText('', 20, 2)).toEqual([]);
    expect(wrapText('hello', 0, 2)).toEqual([]);
    expect(wrapText('hello', 20, 0)).toEqual([]);
  });

  it('wraps words greedily within the character budget', () => {
    const lines = wrapText('the quick brown fox jumps over the lazy dog', 20, 3);
    expect(lines).toHaveLength(3);
    lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(20 + 1));
  });

  it('returns a single line when text fits', () => {
    expect(wrapText('Hello World', 20, 2)).toEqual(['Hello World']);
  });

  it('ellipsizes when text overflows the line budget', () => {
    const lines = wrapText('one two three four five six seven eight nine', 10, 2);
    expect(lines).toHaveLength(2);
    expect(lines[lines.length - 1].endsWith('…')).toBe(true);
  });

  it('hard-cuts a single word longer than the budget', () => {
    const lines = wrapText('Supercalifragilisticexpialidocious', 10, 2);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('Supercali…');
  });

  it('never emits more lines than maxLines', () => {
    const lines = wrapText('a b c d e f g h i j k', 3, 2);
    expect(lines.length).toBeLessThanOrEqual(2);
  });
});

describe('stripHtml', () => {
  it('returns empty string for empty / nullish input', () => {
    expect(stripHtml('')).toBe('');
    // @ts-expect-error intentional bad input
    expect(stripHtml(null)).toBe('');
    // @ts-expect-error intentional bad input
    expect(stripHtml(undefined)).toBe('');
  });

  it('removes simple tags and returns the text content', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('inserts spaces around block-level close tags to avoid word collisions', () => {
    expect(stripHtml('<ul><li>One</li><li>Two</li></ul>')).toBe('One Two');
  });

  it('decodes common named entities', () => {
    expect(stripHtml('Tom&nbsp;&amp;&nbsp;Jerry')).toBe('Tom & Jerry');
    expect(stripHtml('Hello&mdash;world')).toBe('Hello—world');
  });

  it('decodes numeric and hex entities', () => {
    expect(stripHtml('A&#183;B&#x2022;C')).toBe('A·B•C');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('foo\n\n\n   bar\t\tbaz')).toBe('foo bar baz');
  });

  it('strips long real-world description markup into readable text', () => {
    const out = stripHtml(
      'Adds new Thread Groups: <ul><li><a href=https://example.com/wiki/Stepping>Stepping Thread Group</a></li><li><a href=https://example.com/wiki/Ultimate>Ultimate Thread Group</a></li></ul>'
    );
    expect(out).toBe(
      'Adds new Thread Groups: Stepping Thread Group Ultimate Thread Group'
    );
  });

  it('preserves unknown entities rather than dropping them silently', () => {
    // Less important to decode — safer to leave as-is than to lose content.
    expect(stripHtml('foo &weirdname; bar')).toBe('foo &weirdname; bar');
  });
});

describe('formatDownloads', () => {
  it('returns "0" for non-finite, zero, or negative values', () => {
    expect(formatDownloads(undefined)).toBe('0');
    expect(formatDownloads(Number.NaN)).toBe('0');
    expect(formatDownloads(0)).toBe('0');
    expect(formatDownloads(-5)).toBe('0');
  });

  it('returns raw number for values under 1000', () => {
    expect(formatDownloads(42)).toBe('42');
    expect(formatDownloads(999)).toBe('999');
  });

  it('formats thousands with K suffix', () => {
    expect(formatDownloads(1_000)).toBe('1K');
    expect(formatDownloads(1_500)).toBe('1.5K');
    expect(formatDownloads(12_345)).toBe('12.3K');
  });

  it('formats millions with M suffix', () => {
    expect(formatDownloads(1_000_000)).toBe('1M');
    expect(formatDownloads(2_500_000)).toBe('2.5M');
  });

  it('trims trailing .0', () => {
    expect(formatDownloads(2_000)).toBe('2K');
    expect(formatDownloads(3_000_000)).toBe('3M');
  });
});

describe('buildPluginOgSvg', () => {
  const basePlugin = {
    id: 'acme-foo',
    name: 'Acme Foo Plugin',
    vendor: 'Acme Corp',
    description: 'Ships a bundle of reliable load-testing goodies for JMeter.',
    category: 'Samplers',
    downloads: 42_500,
    isAiReady: true,
    isFeatured: false,
  };

  it('returns a well-formed SVG string with the correct dimensions', () => {
    const svg = buildPluginOgSvg(basePlugin);
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain(`width="${OG_WIDTH}"`);
    expect(svg).toContain(`height="${OG_HEIGHT}"`);
    expect(svg).toContain('</svg>');
  });

  it('embeds the plugin name, vendor, and formatted downloads', () => {
    const svg = buildPluginOgSvg(basePlugin);
    expect(svg).toContain('Acme Foo Plugin');
    expect(svg).toContain('By Acme Corp');
    expect(svg).toContain('42.5K DOWNLOADS');
  });

  it('renders the AI Ready pill when isAiReady is true', () => {
    const svg = buildPluginOgSvg(basePlugin);
    expect(svg).toContain('AI READY');
  });

  it('omits the Featured pill when isFeatured is false', () => {
    const svg = buildPluginOgSvg(basePlugin);
    expect(svg).not.toContain('FEATURED');
  });

  it('renders the Featured pill when isFeatured is true', () => {
    const svg = buildPluginOgSvg({ ...basePlugin, isFeatured: true, isAiReady: false });
    expect(svg).toContain('FEATURED');
    expect(svg).not.toContain('AI READY');
  });

  it('escapes hostile plugin names so SVG cannot break or inject markup', () => {
    const svg = buildPluginOgSvg({
      ...basePlugin,
      name: '<script>alert("x")</script>',
      vendor: 'Evil & Co',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('Evil &amp; Co');
  });

  it('falls back to safe defaults when optional fields are missing', () => {
    const svg = buildPluginOgSvg({ id: 'x', name: 'Minimal' });
    expect(svg).toContain('Minimal');
    expect(svg).toContain('By Unknown vendor');
    expect(svg).toContain('PLUGIN &#183; 0 DOWNLOADS');
  });

  it('omits the description block when no description is supplied', () => {
    const svg = buildPluginOgSvg({ id: 'x', name: 'No Desc' });
    // The description <text> element is only emitted when lines exist.
    // Look for a marker that would only appear if description branch rendered.
    expect(svg).not.toMatch(/fill="#d4d4d8"/);
  });

  it('includes the PerfAtlas brand mark and footer domain', () => {
    const svg = buildPluginOgSvg(basePlugin);
    expect(svg).toContain('Perf');
    expect(svg).toContain('Atlas');
    expect(svg).toContain('plugins.jmeter.ai');
  });

  it('regression: never positions the description above the vendor line when the name wraps to two lines', () => {
    // Pathological case: a plugin like "Atakama Variabilization Plugin" with
    // a two-line name plus a long description must not render the description
    // lines on top of (or above) the "By <vendor>" line.
    const svg = buildPluginOgSvg({
      id: 'atakama',
      name: 'Atakama Variabilization Plugin',
      vendor: 'Atakama Technologies',
      description:
        'Variabilization plugin for jmeter: You can request a trial by following this link: https://example.com/trial',
      category: 'Samplers',
      downloads: 10,
    });

    // Parse the absolute y-coordinate of the vendor line: `<text x="64" y="NN"`
    // (the vendor text element uses the #ccff00 fill color).
    const vendorYMatch = svg.match(/<text\s+x="\d+"\s+y="(\d+)"[^>]*fill="#ccff00"/);
    expect(vendorYMatch, 'vendor text element must exist').not.toBeNull();
    const vendorY = parseInt(vendorYMatch![1], 10);

    // The description text element (identified by its body fill color).
    const descYMatch = svg.match(/<text\s+x="\d+"\s+y="(\d+)"[^>]*fill="#d4d4d8"/);
    if (descYMatch) {
      const descY = parseInt(descYMatch[1], 10);
      // Description first line baseline must sit strictly below the vendor baseline.
      expect(descY).toBeGreaterThan(vendorY);
    }
    // Otherwise description was clamped to zero lines — also acceptable, the
    // card just shows name + vendor + tags (no overlap by construction).
  });

  it('regression: produces well-formed SVG even when description contains raw HTML and long URL tokens', () => {
    // Real-world pathological case observed in `jpgc-casutg` and `couchbase`:
    // the description contains <ul><li><a href=https://...> markup where the
    // URL token is longer than the wrap budget, and must not leave a partial
    // entity reference like `&g…` in the output.
    const svg = buildPluginOgSvg({
      id: 'pathological',
      name: 'Pathological Plugin',
      vendor: 'Acme',
      description:
        'Adds new Thread Groups: <ul><li><a href=https://jmeter-plugins.org/wiki/SteppingThreadGroup>Stepping Thread Group</a></li></ul>',
      category: 'Samplers',
      downloads: 100,
    });
    // Every `&` must be followed by a valid entity name and terminating `;`.
    const ampersands = [...svg.matchAll(/&([^;\s<>]*?)(;|$)/g)];
    for (const m of ampersands) {
      const name = m[1];
      const terminated = m[2] === ';';
      expect(terminated, `unterminated entity near "&${name}"`).toBe(true);
      // Allow standard XML entities and numeric refs.
      expect(name).toMatch(/^(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+)$/);
    }
  });
});
