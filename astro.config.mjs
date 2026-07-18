import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import mdx from '@astrojs/mdx';
import pagefind from 'astro-pagefind';
import compress from 'astro-compress';
import clerk from '@clerk/astro';

// https://astro.build/config
export default defineConfig({
  site: 'https://plugins.jmeter.ai',
  trailingSlash: 'always',
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
          return { ...item, changefreq: 'daily', priority: 1.0 };
        }
        // Blog index
        if (item.url === 'https://plugins.jmeter.ai/blog/') {
          return { ...item, changefreq: 'weekly', priority: 0.9 };
        }
        // Compare tool
        if (item.url === 'https://plugins.jmeter.ai/compare/') {
          return { ...item, changefreq: 'weekly', priority: 0.8 };
        }
        // Recently Updated & Potentially Abandoned SEO Landing Pages
        if (
          item.url === 'https://plugins.jmeter.ai/recently-updated/' ||
          item.url === 'https://plugins.jmeter.ai/potentially-abandoned/'
        ) {
          return { ...item, changefreq: 'daily', priority: 0.7 };
        }
        // Individual plugin pages — data refreshed nightly
        if (item.url.includes('/plugin/')) {
          return { ...item, changefreq: 'daily', priority: 0.8 };
        }
        // Blog posts
        if (item.url.includes('/blog/') && item.url !== 'https://plugins.jmeter.ai/blog/') {
          return { ...item, changefreq: 'monthly', priority: 0.7 };
        }
        // Vendor pages
        if (item.url.includes('/vendor/')) {
          return { ...item, changefreq: 'weekly', priority: 0.6 };
        }
        // Collections
        if (item.url.includes('/collections/')) {
          return { ...item, changefreq: 'monthly', priority: 0.6 };
        }
        return { ...item, changefreq: 'weekly', priority: 0.5 };
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
