/**
 * Prebuild: render one OpenGraph card PNG per plugin and write it to
 * `public/og/plugin/<id>.png`. Runs via `tsx` so it can import the typed
 * SVG builder directly from `src/utils/og.ts` (single source of truth).
 *
 * Skips plugins whose PNG is already present AND newer than the source data
 * file, so repeated dev iterations stay fast. Pass `--force` to re-render
 * everything.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { buildPluginOgSvg, type OgPluginInput } from '../src/utils/og.ts';
import { inferCategory } from '../src/utils/plugin.ts';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'plugins_data.json');
const OUT_DIR = path.join(ROOT, 'public', 'og', 'plugin');

const FORCE = process.argv.includes('--force');

interface RawPlugin {
    id: string;
    name: string;
    vendor?: string;
    description?: string;
    componentClasses?: string[];
    isAiReady?: boolean;
    isFeatured?: boolean;
    stats?: { absoluteDownloads?: number };
}

async function fileExistsNewerThan(target: string, source: string): Promise<boolean> {
    try {
        const [targetStat, sourceStat] = await Promise.all([fs.stat(target), fs.stat(source)]);
        return targetStat.mtimeMs >= sourceStat.mtimeMs;
    } catch {
        return false;
    }
}

function toOgInput(plugin: RawPlugin): OgPluginInput {
    return {
        id: plugin.id,
        name: plugin.name,
        vendor: plugin.vendor,
        description: plugin.description,
        category: inferCategory({
            id: plugin.id,
            componentClasses: plugin.componentClasses,
        }),
        downloads: plugin.stats?.absoluteDownloads,
        isAiReady: Boolean(plugin.isAiReady),
        isFeatured: Boolean(plugin.isFeatured),
    };
}

async function renderPluginOg(plugin: RawPlugin): Promise<'written' | 'skipped'> {
    const outPath = path.join(OUT_DIR, `${plugin.id}.png`);
    if (!FORCE && (await fileExistsNewerThan(outPath, DATA_PATH))) {
        return 'skipped';
    }

    const svg = buildPluginOgSvg(toOgInput(plugin));
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: 1200 },
        font: {
            loadSystemFonts: true,
            defaultFontFamily: 'Arial',
        },
        background: '#0b0b0d',
    });
    const png = resvg.render().asPng();
    await fs.writeFile(outPath, png);
    return 'written';
}

async function main() {
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const plugins: RawPlugin[] = JSON.parse(raw);
    if (!Array.isArray(plugins) || plugins.length === 0) {
        console.warn('[og] no plugins found in data file, nothing to render');
        return;
    }

    await fs.mkdir(OUT_DIR, { recursive: true });

    const start = Date.now();
    let written = 0;
    let skipped = 0;
    let failed = 0;

    // Small concurrency pool keeps Windows file IO happy while still being fast.
    const CONCURRENCY = 6;
    let cursor = 0;
    async function worker(id: number) {
        while (cursor < plugins.length) {
            const index = cursor++;
            const plugin = plugins[index];
            if (!plugin || !plugin.id) continue;
            try {
                const result = await renderPluginOg(plugin);
                if (result === 'written') written++;
                else skipped++;
            } catch (err) {
                failed++;
                console.error(`[og] failed to render ${plugin.id}:`, (err as Error).message);
            }
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
        `[og] rendered ${written} PNG(s), skipped ${skipped} up-to-date, ${failed} failed in ${elapsed}s`
    );

    if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error('[og] fatal error:', err);
    process.exit(1);
});
