// @ts-check
/** @type {import('prettier').Config} */
export default {
  // Base formatting
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  bracketSpacing: true,
  arrowParens: 'always',

  // End of line
  endOfLine: 'lf',

  // Plugins
  plugins: ['prettier-plugin-astro', 'prettier-plugin-tailwindcss'],

  // File-specific overrides
  overrides: [
    {
      files: '*.astro',
      options: {
        parser: 'astro',
      },
    },
    {
      files: ['*.md', '*.mdx'],
      options: {
        proseWrap: 'always',
        embeddedLanguageFormatting: 'off',
      },
    },
    {
      files: ['*.json'],
      options: {
        parser: 'json',
      },
    },
  ],

  // Tailwind class sorting
  tailwindFunctions: ['clsx', 'cn', 'tw'],
  tailwindAttributes: ['class', 'className'],
};
