/**
 * Pure-function builder for per-plugin OpenGraph card SVG markup.
 *
 * The output is a 1200x630 SVG string ready to rasterize into PNG via
 * `@resvg/resvg-js` (see `scripts/generateOgImages.mjs`). Kept free of any
 * Node or DOM dependencies so it can be unit-tested as a plain function.
 */

export interface OgPluginInput {
  id: string;
  name: string;
  vendor?: string;
  description?: string;
  category?: string;
  downloads?: number;
  isAiReady?: boolean;
  isFeatured?: boolean;
}

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const NAME_MAX_CHARS_PER_LINE = 26;
const NAME_MAX_LINES = 2;
const DESC_MAX_CHARS_PER_LINE = 60;
const DESC_MAX_LINES = 2;

/**
 * Escape the five XML characters. Must be applied to every user-provided
 * string rendered into the SVG.
 */
export function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const HTML_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ldquo: '"',
  rdquo: '"',
  lsquo: "'",
  rsquo: "'",
  mdash: '—',
  ndash: '–',
  hellip: '…',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
};

/**
 * Convert HTML-ish text to plain text suitable for OG card bodies.
 * Removes tags, decodes common named entities + numeric entities, and
 * collapses whitespace. Safe to feed arbitrary strings from upstream repos.
 */
export function stripHtml(input: string): string {
  if (!input) return '';
  // Replace block-level tags with a space to prevent word collisions like
  // "ItemOneItemTwo" from `<li>ItemOne</li><li>ItemTwo</li>`.
  const withBreaks = input.replace(/<(br|\/li|\/p|\/div|\/h[1-6])\b[^>]*>/gi, ' ');
  const stripped = withBreaks.replace(/<[^>]+>/g, '');
  const decoded = stripped
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-zA-Z]+);/g, (match, name) => HTML_ENTITIES[name] ?? match);
  return decoded.replace(/\s+/g, ' ').trim();
}

/**
 * Greedy word-wrap. Returns up to `maxLines` lines, each no wider than
 * `maxChars`. When the input overflows the budget the final line is suffixed
 * with an ellipsis. A single word longer than `maxChars` is hard-cut.
 */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  if (!text || maxLines <= 0 || maxChars <= 0) return [];
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  let wordIndex = 0;

  for (; wordIndex < words.length; wordIndex++) {
    const word = words[wordIndex];
    if (word.length > maxChars) {
      // Word is longer than the line budget: flush current, hard-cut the word.
      if (current) {
        lines.push(current);
        current = '';
        if (lines.length >= maxLines) break;
      }
      lines.push(word.slice(0, maxChars - 1) + '…');
      if (lines.length >= maxLines) {
        wordIndex++;
        break;
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  // If there's leftover text we couldn't fit, signal truncation with …
  const consumed = lines.join(' ').split(/\s+/).length;
  if (consumed < words.length && lines.length > 0) {
    const last = lines[lines.length - 1];
    if (!last.endsWith('…')) {
      const trimmed = last.length >= maxChars ? last.slice(0, maxChars - 1) : last;
      lines[lines.length - 1] = trimmed + '…';
    }
  }

  return lines;
}

export function formatDownloads(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

interface Tag {
  label: string;
  color: string;
  textColor: string;
}

function buildTags(plugin: OgPluginInput): Tag[] {
  const tags: Tag[] = [];
  if (plugin.isAiReady) tags.push({ label: 'AI Ready', color: '#ccff00', textColor: '#0b0b0d' });
  if (plugin.isFeatured) tags.push({ label: 'Featured', color: '#a855f7', textColor: '#ffffff' });
  return tags;
}

/**
 * Build the full OG card SVG string for a plugin.
 */
export function buildPluginOgSvg(plugin: OgPluginInput): string {
  // IMPORTANT: wrap BEFORE escaping. Hard-cutting ellipsis on an already-escaped
  // string can slice through an XML entity (e.g. `&gt;` → `&g…`) and produce
  // malformed SVG. Wrapping the raw text first and escaping each resulting
  // line keeps entities atomic.
  const rawName = plugin.name || 'Untitled Plugin';
  // Descriptions from upstream repos sometimes contain raw HTML markup
  // (`<ul><li><a href=...>`). Strip to plain text before wrapping so the
  // card body reads naturally instead of showing literal tags.
  const rawDescription = stripHtml(plugin.description || '');
  const nameLinesRaw = wrapText(rawName, NAME_MAX_CHARS_PER_LINE, NAME_MAX_LINES);

  const vendor = escapeXml(plugin.vendor || 'Unknown vendor');
  const category = escapeXml(plugin.category || 'Plugin');
  const downloads = formatDownloads(plugin.downloads);

  // Layout anchors (px). The card flows top-down for the name / vendor, and
  // the description grows upward from a bottom-anchored tag row. The number
  // of description lines is clamped to whatever actually fits below the
  // vendor line so a long name never collides with the description.
  const pad = 64;
  const nameY = 200;
  const nameLineHeight = 92;
  const descLineHeight = 42;
  const vendorFontSize = 28;
  const vendorGap = 70; // gap from last name baseline to vendor baseline
  const vendorY = nameY + (nameLinesRaw.length - 1) * nameLineHeight + vendorGap;

  const tags = buildTags(plugin);
  const tagY = OG_HEIGHT - 140; // rect top; bottom ≈ 534, footer @ 566
  const descLastBaseline = tagY - 28;

  // Approximate bottom of the vendor line (text descent ≈ 30% of font size),
  // then reserve a breathing gap before the description may start.
  const vendorBottom = vendorY + Math.ceil(vendorFontSize * 0.35);
  const descStartMin = vendorBottom + 28;
  const availableDescPx = descLastBaseline - descStartMin;
  const maxDescLinesThatFit = availableDescPx >= 0
    ? Math.floor(availableDescPx / descLineHeight) + 1
    : 0;
  const effectiveDescMaxLines = Math.min(DESC_MAX_LINES, Math.max(0, maxDescLinesThatFit));

  const nameLines = nameLinesRaw.map(escapeXml);
  const descLines = rawDescription && effectiveDescMaxLines > 0
    ? wrapText(rawDescription, DESC_MAX_CHARS_PER_LINE, effectiveDescMaxLines).map(escapeXml)
    : [];

  // Flow description top-down immediately under the vendor line; clamping to
  // `effectiveDescMaxLines` (above) already guarantees it cannot overflow into
  // the tag row, and a short description no longer leaves a huge visual gap.
  const descY = descLines.length > 0 ? descStartMin : 0;

  const nameTspans = nameLines
    .map((line, i) => `<tspan x="${pad}" dy="${i === 0 ? 0 : nameLineHeight}">${line}</tspan>`)
    .join('');

  const descTspans = descLines
    .map(
      (line, i) =>
        `<tspan x="${pad}" dy="${i === 0 ? 0 : descLineHeight}">${line}</tspan>`
    )
    .join('');

  // Tag pills in the bottom-left row
  let tagX = pad;
  const tagsSvg = tags
    .map((tag) => {
      const pillPadX = 18;
      const approxWidth = tag.label.length * 13 + pillPadX * 2;
      const pill = `
        <g transform="translate(${tagX}, ${tagY})">
          <rect x="0" y="0" rx="20" ry="20" width="${approxWidth}" height="44" fill="${tag.color}" />
          <text x="${approxWidth / 2}" y="28" font-family="Arial, Helvetica, sans-serif"
                font-size="18" font-weight="700" fill="${tag.textColor}"
                text-anchor="middle" letter-spacing="1.2">${tag.label.toUpperCase()}</text>
        </g>
      `;
      tagX += approxWidth + 14;
      return pill;
    })
    .join('');

  // Brand mark (top-left): Atlas dot-pattern + wordmark
  const brand = `
    <g transform="translate(${pad}, ${pad})">
      <circle cx="18" cy="18" r="18" fill="#ccff00" />
      <circle cx="18" cy="18" r="6" fill="#0b0b0d" />
      <text x="56" y="26" font-family="Arial, Helvetica, sans-serif"
            font-size="28" font-weight="800" fill="#ffffff" letter-spacing="-0.5">
        Perf<tspan fill="#ccff00">Atlas</tspan>
      </text>
    </g>
  `;

  // Category + downloads badge (top-right)
  const topRight = `
    <g transform="translate(${OG_WIDTH - pad}, ${pad + 18})">
      <text font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600"
            fill="#9ca3af" text-anchor="end" letter-spacing="1.5">
        ${category.toUpperCase()} &#183; ${downloads} DOWNLOADS
      </text>
    </g>
  `;

  // Footer domain mark (bottom-right)
  const footer = `
    <text x="${OG_WIDTH - pad}" y="${OG_HEIGHT - 64}"
          font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="600"
          fill="#6b7280" text-anchor="end" letter-spacing="1">
      plugins.jmeter.ai
    </text>
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0b0d" />
      <stop offset="100%" stop-color="#18181b" />
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ccff00" />
      <stop offset="100%" stop-color="#84cc16" />
    </linearGradient>
    <radialGradient id="glow" cx="85%" cy="15%" r="50%">
      <stop offset="0%" stop-color="#ccff00" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#ccff00" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)" />
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#glow)" />
  <rect x="0" y="0" width="${OG_WIDTH}" height="6" fill="url(#accent)" />

  ${brand}
  ${topRight}

  <text x="${pad}" y="${nameY}" font-family="Arial, Helvetica, sans-serif"
        font-size="80" font-weight="800" fill="#ffffff" letter-spacing="-1.5">
    ${nameTspans}
  </text>

  <text x="${pad}" y="${vendorY}" font-family="Arial, Helvetica, sans-serif"
        font-size="28" font-weight="600" fill="#ccff00" letter-spacing="0.5">
    By ${vendor}
  </text>

  ${descLines.length > 0 ? `
  <text x="${pad}" y="${descY}" font-family="Arial, Helvetica, sans-serif"
        font-size="26" font-weight="400" fill="#d4d4d8">
    ${descTspans}
  </text>` : ''}

  ${tagsSvg}
  ${footer}
</svg>`;
}
