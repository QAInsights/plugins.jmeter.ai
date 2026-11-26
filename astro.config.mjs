import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import mdx from '@astrojs/mdx';
import pagefind from 'astro-pagefind';
import compress from 'astro-compress';
import clerk from '@clerk/astro';

const buildDateIso = new Date().toISOString();

function loadPluginLastmodMap() {
  const map = new Map();
  try {
    const raw = fs.readFileSync(path.resolve('src/data/plugins_data.json'), 'utf8');
    for (const p of JSON.parse(raw)) {
      const dateStr = p?.githubInfo?.health?.lastCommitAt;
      if (p?.id && dateStr) {
        const d = new Date(dateStr);
        if (!Number.isNaN(d.getTime())) {
          map.set(p.id, d.toISOString());
        }
      }
    }
  } catch {
    // Fallback to build date if plugins_data.json is unavailable
  }
  return map;
}

function loadBlogLastmodMap() {
  const map = new Map();
  try {
    const blogDir = path.resolve('src/content/blog');
    for (const file of fs.readdirSync(blogDir)) {
      if (!file.endsWith('.md') && !file.endsWith('.mdx')) continue;
      const slug = file.replace(/\.(md|mdx)$/, '').toLowerCase();
      const raw = fs.readFileSync(path.join(blogDir, file), 'utf8');
      const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
      const updated = fm.match(/^updatedDate:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
      const pub = fm.match(/^pubDate:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
      const dateStr = updated || pub;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!Number.isNaN(d.getTime())) {
          map.set(slug, d.toISOString());
        }
      }
    }
  } catch {
    // Fallback to build date if blog directory is unavailable
  }
  return map;
}

const pluginLastmodMap = loadPluginLastmodMap();
const blogLastmodMap = loadBlogLastmodMap();

// https://astro.build/config
export default defineConfig({
  site: 'https://plugins.jmeter.ai',
  trailingSlash: 'always',
  adapter: process.env.VITEST
    ? undefined
    : cloudflare({
        platformProxy: { enabled: true },
        imageService: 'compile',
      }),
  // Keep Astro 6 HTML-aware spacing between inline elements (v7 default is 'jsx').
  compressHTML: true,
  redirects: {
    '/blog/1': '/blog/',
  },
  integrations: [
    expressiveCode({
      themes: ['github-light', 'dracula'],
      useDarkModeMediaQuery: false,
      themeCssSelector: (theme) => (theme.type === 'dark' ? '.dark' : ':root:not(.dark)'),
      styleOverrides: {
        borderRadius: '0.75rem',
        codeFontSize: '0.9rem',
      },
    }),
    mdx(),
    sitemap({
      // Exclude auth-protected pages — AI agents shouldn't index these
      filter: (page) => !page.includes('/settings'),
      // Per-URL changefreq and priority — freshness signals for AI crawlers
      customPages: [],
      serialize(item) {
        // Home page — nightly data sync, highest priority
        if (item.url === 'https://plugins.jmeter.ai/') {
          return { ...item, lastmod: buildDateIso, changefreq: 'daily', priority: 1.0 };
        }
        // Blog index
        if (item.url === 'https://plugins.jmeter.ai/blog/') {
          return { ...item, lastmod: buildDateIso, changefreq: 'weekly', priority: 0.9 };
        }
        // Compare tool
        if (item.url === 'https://plugins.jmeter.ai/compare/') {
          return { ...item, lastmod: buildDateIso, changefreq: 'weekly', priority: 0.8 };
        }
        // Recently Updated & Potentially Abandoned SEO Landing Pages
        if (
          item.url === 'https://plugins.jmeter.ai/recently-updated/' ||
          item.url === 'https://plugins.jmeter.ai/potentially-abandoned/'
        ) {
          return { ...item, lastmod: buildDateIso, changefreq: 'daily', priority: 0.7 };
        }
        // Individual plugin pages — use last GitHub commit date or build date
        if (item.url.includes('/plugin/')) {
          const pluginId = item.url.split('/plugin/')[1]?.replace(/\/$/, '') ?? '';
          const lastmod = pluginLastmodMap.get(pluginId) || buildDateIso;
          return { ...item, lastmod, changefreq: 'daily', priority: 0.8 };
        }
        // Blog posts — use updatedDate or pubDate from frontmatter
        if (item.url.includes('/blog/') && item.url !== 'https://plugins.jmeter.ai/blog/') {
          const slug = item.url.split('/blog/')[1]?.replace(/\/$/, '').toLowerCase() ?? '';
          const lastmod = blogLastmodMap.get(slug) || buildDateIso;
          return { ...item, lastmod, changefreq: 'monthly', priority: 0.7 };
        }
        // Tools — interactive utilities, stable URLs
        if (item.url.includes('/tools/')) {
          return { ...item, lastmod: buildDateIso, changefreq: 'monthly', priority: 0.7 };
        }
        // Vendor pages
        if (item.url.includes('/vendor/')) {
          return { ...item, lastmod: buildDateIso, changefreq: 'weekly', priority: 0.6 };
        }
        // Collections
        if (item.url.includes('/collections/')) {
          return { ...item, lastmod: buildDateIso, changefreq: 'monthly', priority: 0.6 };
        }
        return { ...item, lastmod: buildDateIso, changefreq: 'weekly', priority: 0.5 };
      },
    }),
    pagefind(),
    compress({
      CSS: true,
      HTML: {
        'collapse-whitespace': true,
        'remove-comments': true,
      },
      Image: false, // We use Astro's built-in image optimization
      JavaScript: false,
      SVG: true,
    }),
    clerk(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
