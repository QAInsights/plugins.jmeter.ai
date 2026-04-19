/**
 * Generate a unique featured image for the "What's new in PerfAtlas" blog post.
 * Creates a 1200x675 composition showing Star Map, Heatmap, and Timeline elements.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_PATH = path.join(ROOT, 'src', 'assets', 'blog', 'new-in-perfatlas-featured.png');

const WIDTH = 1200;
const HEIGHT = 675;

function generateFeaturedSvg(): string {
  // Generate stars for Star Map visualization
  const stars = [
    { cx: 120, cy: 140, r: 18, ai: true },
    { cx: 280, cy: 180, r: 14, ai: false },
    { cx: 180, cy: 240, r: 22, ai: true },
    { cx: 340, cy: 130, r: 12, ai: false },
    { cx: 90, cy: 280, r: 16, ai: true },
    { cx: 250, cy: 300, r: 10, ai: false },
    { cx: 380, cy: 220, r: 20, ai: true },
    { cx: 140, cy: 360, r: 8, ai: false },
    { cx: 320, cy: 360, r: 14, ai: false },
    { cx: 200, cy: 100, r: 10, ai: true },
  ];

  const starElements = stars.map((s, i) => {
    const color = s.ai ? '#ccff00' : '#ffffff';
    const glowId = `star-glow-${i}`;
    const glow = s.ai ? `
      <radialGradient id="${glowId}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ccff00" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="#ccff00" stop-opacity="0"/>
      </radialGradient>
      <circle cx="${s.cx}" cy="${s.cy}" r="${s.r * 2}" fill="url(#${glowId})"/>
    ` : '';
    return `
      ${glow}
      <circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${color}" opacity="${s.ai ? 1 : 0.7}"/>
    `;
  }).join('');

  // Connection lines between nearby stars
  const connections = [
    [0, 2], [2, 6], [6, 3], [3, 1], [1, 9], [9, 0],
    [0, 4], [4, 7], [7, 8], [8, 6], [2, 5], [5, 8]
  ];
  const connectionLines = connections.map(([a, b]) => {
    return `<line x1="${stars[a].cx}" y1="${stars[a].cy}" x2="${stars[b].cx}" y2="${stars[b].cy}" stroke="#ffffff" stroke-width="1" opacity="0.15"/>`;
  }).join('');

  // Heatmap grid (right side)
  const heatmapColors = ['#163a00', '#4d7c0f', '#84cc16', '#ccff00'];
  const heatmapCells = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 10; col++) {
      const level = Math.floor(Math.random() * 4);
      const x = 720 + col * 44;
      const y = 100 + row * 44;
      heatmapCells.push(`<rect x="${x}" y="${y}" width="36" height="36" rx="4" fill="${heatmapColors[level]}"/>`);
    }
  }

  // Timeline dots (left side, bottom)
  const timelineY = 520;
  const timelineDots = Array.from({ length: 6 }, (_, i) => {
    const x = 80 + i * 60;
    const size = i === 0 ? 12 : 8;
    const fill = i === 0 ? '#ccff00' : '#374151';
    return `<circle cx="${x}" cy="${timelineY}" r="${size}" fill="${fill}" stroke="#ccff00" stroke-width="2"/>`;
  }).join('');

  // Shooting star
  const shootingStar = `
    <line x1="550" y1="80" x2="650" y2="140" stroke="#ffffff" stroke-width="2" opacity="0.6" stroke-linecap="round"/>
    <circle cx="650" cy="140" r="3" fill="#ffffff"/>
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b0b0d"/>
      <stop offset="100%" stop-color="#18181b"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ccff00"/>
      <stop offset="100%" stop-color="#84cc16"/>
    </linearGradient>
    <radialGradient id="centerGlow" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#ccff00" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#ccff00" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#centerGlow)"/>

  <!-- Star Map section (left-center) -->
  <g>
    ${connectionLines}
    ${starElements}
  </g>

  <!-- Shooting star -->
  ${shootingStar}

  <!-- Heatmap section (right) -->
  <g>
    ${heatmapCells.join('')}
  </g>

  <!-- Timeline section (bottom) -->
  <line x1="80" y1="${timelineY}" x2="380" y2="${timelineY}" stroke="#374151" stroke-width="2"/>
  ${timelineDots}

  <!-- Title text -->
  <g transform="translate(600, 320)">
    <text x="0" y="0" font-family="Inter, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#ccff00" text-anchor="middle" letter-spacing="4">PERFATLAS UPDATE</text>
    <text x="0" y="60" font-family="Inter, -apple-system, sans-serif" font-size="72" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="-2">What's New</text>
    <text x="0" y="110" font-family="Inter, -apple-system, sans-serif" font-size="24" font-weight="500" fill="#9ca3af" text-anchor="middle">Star Map · Heatmap · Timeline · OG Cards</text>
  </g>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="${WIDTH}" height="6" fill="url(#accent)"/>

  <!-- Decorative corner elements -->
  <rect x="60" y="60" width="60" height="60" rx="8" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.1"/>
  <rect x="1080" y="480" width="60" height="60" rx="8" fill="none" stroke="#ccff00" stroke-width="1" opacity="0.2"/>
</svg>`;
}

async function main() {
  const svg = generateFeaturedSvg();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
    font: { loadSystemFonts: true, defaultFontFamily: 'Inter' },
    background: '#0b0b0d',
  });
  const png = resvg.render().asPng();
  await fs.writeFile(OUT_PATH, png);
  console.log(`[blog] featured image written: ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
