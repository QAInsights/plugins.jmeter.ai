# Light Theme Fixes

## Context

The site's dark theme is well-polished, but light theme has 7 confirmed defects: an
invisible-in-dark-only hero overlay painted dark in light mode, code blocks stuck on the Dracula
dark theme, lime `#ccff00` text that's nearly invisible on white, and Pagefind search styles using
dark-only colors. Theming is class-based (`.dark` on `<html>`, Tailwind v4
`@custom-variant dark (&:is(.dark *))`), persisted via `localStorage.theme`.

Scope (user-approved): **bugs + contrast fixes only**. Dark-styled widgets (CompareFloatingBar,
InstallFloatingBar, FavoritesManager banner, CollectionInstallBlock, Tooltip) stay dark in both
themes — intentional design. PWA manifest colors and `<html class="dark">` default left as-is.

## Changes

### 1. Code blocks: add light theme, synced to the `.dark` class

**File:** `astro.config.mjs` (~line 17-25)

```js
expressiveCode({
  themes: ['dracula', 'github-light'],
  useDarkModeMediaQuery: false,
  themeCssSelector: (theme) => (theme.type === 'dark' ? '.dark' : ':root:not(.dark)'),
  styleOverrides: { ... },  // unchanged
}),
```

Critical detail: adding a second theme alone is NOT enough. Expressive Code defaults to
`prefers-color-scheme` media queries for theme selection, but this site toggles via the `.dark`
class — the code theme would desync from the site toggle (e.g. dark OS + light site would show
Dracula on white). `useDarkModeMediaQuery: false` + `themeCssSelector` binds each theme to the
site's class instead.

### 2. Blog hero overlay — dark smudge over light hero

**Files:** `src/pages/blog/index.astro:33`, `src/pages/blog/[page].astro:39`

```diff
- <div class="to-dark-bg/80 absolute inset-0 bg-gradient-to-b from-transparent"></div>
+ <div class="dark:to-dark-bg/80 absolute inset-0 bg-gradient-to-b from-transparent"></div>
```

Without a `to-*` color in light mode, Tailwind's gradient `to` defaults to transparent → overlay
becomes invisible. Matches the already-`dark:`-prefixed `dark:bg-dark-bg` on the parent section.

### 3. "Read Post" link — lime on white (~1.5:1 contrast)

**File:** `src/pages/blog/[page].astro:161`

```diff
- class="... tracking-widest text-[#ccff00] uppercase opacity-0 ..."
+ class="... tracking-widest text-green-600 dark:text-[#ccff00] uppercase opacity-0 ..."
```

Mirrors the correct pattern already at `src/pages/blog/index.astro:166`.

### 4. Gradient headings — washed out on white

**Files (identical fix in all 4):**

- `src/pages/compare.astro:24`
- `src/pages/vendor/index.astro:53`
- `src/pages/collections/index.astro:52`
- `src/pages/recently-updated.astro:50`

```diff
- class="bg-gradient-to-r from-green-400 to-[#ccff00] bg-clip-text text-transparent"
+ class="bg-gradient-to-r from-green-500 to-green-600 bg-clip-text text-transparent dark:from-green-400 dark:to-[#ccff00]"
```

Matches the established light/dark gradient pattern used in the blog heroes.

### 5. Pagefind result excerpt — gray-on-white (~2.4:1)

**File:** `src/styles/global.css` (~line 165-168)

```css
.pagefind-ui-custom .pagefind-ui__result-excerpt {
  color: #52525b !important;  /* zinc-600, ~5.7:1 on white */
}
:is(.dark .pagefind-ui-custom) .pagefind-ui__result-excerpt {
  color: #a1a1aa !important;
}
```

### 6. Pagefind result hover — invisible white overlay on white drawer

**File:** `src/styles/global.css` (~line 152-154)

```css
.pagefind-ui-custom .pagefind-ui__result:hover {
  background-color: rgba(0, 0, 0, 0.04) !important;
}
:is(.dark .pagefind-ui-custom) .pagefind-ui__result:hover {
  background-color: rgba(255, 255, 255, 0.03) !important;
}
```

### 7. Text selection — white text on lime (`#b0d600`) in light mode

**File:** `src/layouts/Layout.astro:228` (`<body>` class)

```diff
- class="selection:bg-primary dark:selection:text-dark-bg ... selection:text-white dark:selection:bg-[#ccff00]"
+ class="selection:bg-primary selection:text-dark-bg ... dark:selection:bg-[#ccff00]"
```

Dark text (`#09090b`) on lime is high-contrast in both themes; the `dark:selection:text-dark-bg`
variant becomes redundant and is dropped.

## Verification

1. `npm run build` — must pass (also validates the Expressive Code config change).
2. `npm run dev`, toggle theme via header button, and check in **both** themes:
   - `/blog/` and `/blog/2/` — hero has no dark smudge in light; "Read Post" link readable on card
     hover.
   - `/compare/`, `/vendor/`, `/collections/`, `/recently-updated/` — gradient headings readable in
     light mode.
   - A blog post containing fenced code blocks — code renders github-light in light mode, Dracula in
     dark, and switches with the toggle (not just OS preference — verify by toggling with a
     mismatched OS theme if possible).
   - Header search (Pagefind) — excerpt text and result hover visible in light mode.
   - Select text on any page — readable selection highlight in light mode.
3. Confirm no regression in dark mode on the same pages.

## Out of scope (documented, not changed)

- Dark-in-both-themes widgets: `CompareFloatingBar.astro`, `InstallFloatingBar.astro`,
  `FavoritesManager.astro` import banner, `CollectionInstallBlock.astro`, `Tooltip.astro`.
- `public/site.webmanifest` near-black `theme_color`/`background_color`.
- `<html lang="en" class="dark">` SSR default (site is dark-only with JS disabled).
