import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import mdx from '@astrojs/mdx';

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
    sitemap()
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});