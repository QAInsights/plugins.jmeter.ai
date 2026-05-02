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
  integrations: [
    expressiveCode({
      themes: ['dracula'],
      styleOverrides: {
        borderRadius: '0.75rem',
        codeFontSize: '0.9rem',
      }
    }),
    mdx(),
    sitemap(),
    pagefind(),
    compress({
      CSS: true,
      HTML: {
        'collapse-whitespace': true,
        'remove-comments': true,
      },
      Image: false, // We use Astro's built-in image optimization
      JavaScript: true,
      SVG: true,
    }),
    clerk()
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});