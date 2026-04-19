/**
 * Prebuild: render OpenGraph card PNGs for plugins, vendors, blog posts,
 * and singleton pages (home, blog-index, vendor-index).
 * Writes to `public/og/<type>/<id>.png`. Runs via `tsx`.
 *
 * Skips images already present AND newer than source data.
 * Pass `--force` to re-render everything.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import {
    buildPluginOgSvg,
    buildVendorOgSvg,
    buildVendorIndexOgSvg,
    buildHomeOgSvg,
    buildBlogPostOgSvg,
    buildBlogIndexOgSvg,
    type OgPluginInput,
} from '../src/utils/og.ts';
import { inferCategory } from '../src/utils/plugin.ts';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'plugins_data.json');
const BLOG_DIR = path.join(ROOT, 'src', 'content', 'blog');

const OUT_PLUGIN_DIR = path.join(ROOT, 'public', 'og', 'plugin');
const OUT_VENDOR_DIR = path.join(ROOT, 'public', 'og', 'vendor');
const OUT_BLOG_DIR = path.join(ROOT, 'public', 'og', 'blog');
const OUT_ROOT_DIR = path.join(ROOT, 'public', 'og');

const FORCE = process.argv.includes('--force');
const CONCURRENCY = 6;

interface RawPlugin {
    id: string;
    name: string;
    vendor?: string;
    description?: string;
    componentClasses?: string[];
    isAiReady?: boolean;
    isFeatured?: boolean;
    stats?: { absoluteDownloads?: number; trendingDelta?: number };
}

interface BlogFrontmatter {
    title: string;
    description?: string;
    pubDate?: string;
    author?: string;
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

function renderSvgToPng(svg: string): Buffer {
    const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: 1200 },
        font: {
            loadSystemFonts: true,
            defaultFontFamily: 'Arial',
        },
        background: '#0b0b0d',
    });
    return resvg.render().asPng();
}

// ──────────────────────────────────────────────────────────────────────────
// Plugin OG images
// ──────────────────────────────────────────────────────────────────────────

async function renderPluginOg(plugin: RawPlugin): Promise<'written' | 'skipped'> {
    const outPath = path.join(OUT_PLUGIN_DIR, `${plugin.id}.png`);
    if (!FORCE && (await fileExistsNewerThan(outPath, DATA_PATH))) {
        return 'skipped';
    }

    const svg = buildPluginOgSvg(toOgInput(plugin));
    const png = renderSvgToPng(svg);
    await fs.writeFile(outPath, png);
    return 'written';
}

// ──────────────────────────────────────────────────────────────────────────
// Vendor aggregation and OG images
// ──────────────────────────────────────────────────────────────────────────

interface VendorAggregate {
    name: string;
    pluginCount: number;
    totalDownloads: number;
    totalTrending: number;
    aiReadyCount: number;
    topPluginName?: string;
    topPluginDownloads: number;
}

function aggregateVendors(plugins: RawPlugin[]): Map<string, VendorAggregate> {
    const vendors = new Map<string, VendorAggregate>();

    for (const plugin of plugins) {
        const vendorName = plugin.vendor || 'Unknown vendor';
        const existing = vendors.get(vendorName);

        const downloads = plugin.stats?.absoluteDownloads || 0;
        const trending = plugin.stats?.trendingDelta || 0;
        const isAiReady = Boolean(plugin.isAiReady);

        if (existing) {
            existing.pluginCount += 1;
            existing.totalDownloads += downloads;
            existing.totalTrending += trending;
            if (isAiReady) existing.aiReadyCount += 1;
            if (downloads > existing.topPluginDownloads) {
                existing.topPluginDownloads = downloads;
                existing.topPluginName = plugin.name;
            }
        } else {
            vendors.set(vendorName, {
                name: vendorName,
                pluginCount: 1,
                totalDownloads: downloads,
                totalTrending: trending,
                aiReadyCount: isAiReady ? 1 : 0,
                topPluginName: plugin.name,
                topPluginDownloads: downloads,
            });
        }
    }

    return vendors;
}

async function renderVendorOg(vendor: VendorAggregate): Promise<'written' | 'skipped'> {
    const slug = slugify(vendor.name);
    const outPath = path.join(OUT_VENDOR_DIR, `${slug}.png`);
    if (!FORCE && (await fileExistsNewerThan(outPath, DATA_PATH))) {
        return 'skipped';
    }

    const svg = buildVendorOgSvg({
        vendor: vendor.name,
        pluginCount: vendor.pluginCount,
        totalDownloads: vendor.totalDownloads,
        totalTrending: vendor.totalTrending,
        aiReadyCount: vendor.aiReadyCount,
        topPluginName: vendor.topPluginName,
    });
    const png = renderSvgToPng(svg);
    await fs.writeFile(outPath, png);
    return 'written';
}

async function renderVendorIndexOg(vendors: Map<string, VendorAggregate>, plugins: RawPlugin[]): Promise<'written'> {
    const outPath = path.join(OUT_VENDOR_DIR, 'index.png');

    const totalDownloads = plugins.reduce((sum, p) => sum + (p.stats?.absoluteDownloads || 0), 0);
    const aiReadyCount = plugins.filter(p => p.isAiReady).length;

    const svg = buildVendorIndexOgSvg({
        vendorCount: vendors.size,
        pluginCount: plugins.length,
        totalDownloads,
        aiReadyCount,
    });
    const png = renderSvgToPng(svg);
    await fs.writeFile(outPath, png);
    return 'written';
}

// ──────────────────────────────────────────────────────────────────────────
// Blog post OG images
// ──────────────────────────────────────────────────────────────────────────

function parseFrontmatter(content: string): { frontmatter: Partial<BlogFrontmatter>; body: string } {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: content };

    const frontmatterText = match[1];
    const body = match[2] || '';
    const frontmatter: Partial<BlogFrontmatter> = {};

    const lines = frontmatterText.split('\n');
    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const key = line.slice(0, colonIndex).trim();
            let value = line.slice(colonIndex + 1).trim();
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (key === 'title') frontmatter.title = value;
            else if (key === 'description') frontmatter.description = value;
            else if (key === 'pubDate') frontmatter.pubDate = value;
            else if (key === 'author') frontmatter.author = value;
        }
    }

    return { frontmatter, body };
}

function estimateReadingTime(body: string): string {
    const words = body.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.ceil(words / 200));
    return `${minutes} min read`;
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

async function getBlogPosts(): Promise<Array<{ slug: string; ext: string; frontmatter: BlogFrontmatter; body: string }>> {
    try {
        const files = await fs.readdir(BLOG_DIR);
        const mdFiles = files.filter(f => f.endsWith('.md') || f.endsWith('.mdx'));

        const posts = await Promise.all(
            mdFiles.map(async (file) => {
                const filePath = path.join(BLOG_DIR, file);
                const content = await fs.readFile(filePath, 'utf8');
                const { frontmatter, body } = parseFrontmatter(content);
                const ext = path.extname(file);
                const slug = path.basename(file, ext);
                return {
                    slug,
                    ext,
                    frontmatter: {
                        title: frontmatter.title || slug,
                        description: frontmatter.description,
                        pubDate: frontmatter.pubDate,
                        author: frontmatter.author || 'PerfAtlas',
                    },
                    body,
                };
            })
        );

        return posts;
    } catch {
        return [];
    }
}

async function renderBlogPostOg(post: { slug: string; ext: string; frontmatter: BlogFrontmatter; body: string }): Promise<'written' | 'skipped' | 'error'> {
    const outPath = path.join(OUT_BLOG_DIR, `${post.slug}.png`);
    const sourcePath = path.join(BLOG_DIR, `${post.slug}${post.ext}`);

    if (!FORCE && (await fileExistsNewerThan(outPath, sourcePath))) {
        return 'skipped';
    }

    const readingTime = estimateReadingTime(post.body);

    const svg = buildBlogPostOgSvg({
        title: post.frontmatter.title,
        description: post.frontmatter.description || '',
        author: post.frontmatter.author || 'PerfAtlas',
        pubDate: post.frontmatter.pubDate || new Date(),
        readingTime,
    });
    const png = renderSvgToPng(svg);
    await fs.writeFile(outPath, png);
    return 'written';
}

async function renderBlogIndexOg(): Promise<'written'> {
    const outPath = path.join(OUT_BLOG_DIR, 'index.png');
    const svg = buildBlogIndexOgSvg();
    const png = renderSvgToPng(svg);
    await fs.writeFile(outPath, png);
    return 'written';
}

// ──────────────────────────────────────────────────────────────────────────
// Home page OG image
// ──────────────────────────────────────────────────────────────────────────

async function renderHomeOg(plugins: RawPlugin[], vendors: Map<string, VendorAggregate>): Promise<'written'> {
    const outPath = path.join(OUT_ROOT_DIR, 'home.png');

    const totalDownloads = plugins.reduce((sum, p) => sum + (p.stats?.absoluteDownloads || 0), 0);
    const aiReadyCount = plugins.filter(p => p.isAiReady).length;

    const svg = buildHomeOgSvg({
        pluginCount: plugins.length,
        vendorCount: vendors.size,
        totalDownloads,
        aiReadyCount,
    });
    const png = renderSvgToPng(svg);
    await fs.writeFile(outPath, png);
    return 'written';
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

async function runWithConcurrency<T>(items: T[], fn: (item: T) => Promise<'written' | 'skipped' | 'error'>): Promise<{ written: number; skipped: number; failed: number }> {
    let cursor = 0;
    let written = 0;
    let skipped = 0;
    let failed = 0;

    async function worker() {
        while (cursor < items.length) {
            const index = cursor++;
            const item = items[index];
            if (!item) continue;
            try {
                const result = await fn(item);
                if (result === 'written') written++;
                else if (result === 'skipped') skipped++;
                else failed++;
            } catch (err) {
                failed++;
                console.error('[og] failed:', (err as Error).message);
            }
        }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    return { written, skipped, failed };
}

async function main() {
    const start = Date.now();

    // Read plugin data
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const plugins: RawPlugin[] = JSON.parse(raw);
    if (!Array.isArray(plugins) || plugins.length === 0) {
        console.warn('[og] no plugins found in data file');
    }

    // Aggregate vendor data
    const vendors = aggregateVendors(plugins);

    // Ensure output directories exist
    await fs.mkdir(OUT_PLUGIN_DIR, { recursive: true });
    await fs.mkdir(OUT_VENDOR_DIR, { recursive: true });
    await fs.mkdir(OUT_BLOG_DIR, { recursive: true });
    await fs.mkdir(OUT_ROOT_DIR, { recursive: true });

    // ─────────────────────────────────────────────────────────────────────
    // Render plugin OG images (parallel)
    // ─────────────────────────────────────────────────────────────────────
    console.log('[og] rendering plugin images...');
    const pluginResults = await runWithConcurrency(plugins, renderPluginOg);
    console.log(`[og] plugins: ${pluginResults.written} written, ${pluginResults.skipped} skipped, ${pluginResults.failed} failed`);

    // ─────────────────────────────────────────────────────────────────────
    // Render vendor OG images (parallel)
    // ─────────────────────────────────────────────────────────────────────
    console.log('[og] rendering vendor images...');
    const vendorArray = Array.from(vendors.values());
    const vendorResults = await runWithConcurrency(vendorArray, renderVendorOg);
    console.log(`[og] vendors: ${vendorResults.written} written, ${vendorResults.skipped} skipped, ${vendorResults.failed} failed`);

    // ─────────────────────────────────────────────────────────────────────
    // Render vendor index (singleton)
    // ─────────────────────────────────────────────────────────────────────
    console.log('[og] rendering vendor index...');
    await renderVendorIndexOg(vendors, plugins);
    console.log('[og] vendor index: written');

    // ─────────────────────────────────────────────────────────────────────
    // Render blog post OG images (parallel)
    // ─────────────────────────────────────────────────────────────────────
    console.log('[og] rendering blog images...');
    const blogPosts = await getBlogPosts();
    const blogResults = await runWithConcurrency(blogPosts, renderBlogPostOg);
    console.log(`[og] blog posts: ${blogResults.written} written, ${blogResults.skipped} skipped, ${blogResults.failed} failed`);

    // ─────────────────────────────────────────────────────────────────────
    // Render blog index (singleton)
    // ─────────────────────────────────────────────────────────────────────
    console.log('[og] rendering blog index...');
    await renderBlogIndexOg();
    console.log('[og] blog index: written');

    // ─────────────────────────────────────────────────────────────────────
    // Render home page OG (singleton)
    // ─────────────────────────────────────────────────────────────────────
    console.log('[og] rendering home page...');
    await renderHomeOg(plugins, vendors);
    console.log('[og] home page: written');

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const totalWritten = pluginResults.written + vendorResults.written + blogResults.written + 3; // +3 for singletons
    const totalSkipped = pluginResults.skipped + vendorResults.skipped + blogResults.skipped;
    const totalFailed = pluginResults.failed + vendorResults.failed + blogResults.failed;

    console.log(
        `[og] total: ${totalWritten} written, ${totalSkipped} skipped, ${totalFailed} failed in ${elapsed}s`
    );

    if (totalFailed > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error('[og] fatal error:', err);
    process.exit(1);
});
