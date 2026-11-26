import fs from 'node:fs';
import path from 'node:path';

interface PluginEntry {
  id: string;
  name: string;
  description: string;
  vendor: string;
  helpUrl?: string;
  isAiReady?: boolean;
  jmeterCompatibility?: string | null;
  stats: {
    absoluteDownloads: number;
    trendingDelta: number;
  };
  githubInfo?: {
    stars?: number;
    license?: string;
    health?: {
      score: number;
      label: string;
      lastCommitAt?: string | null;
    };
  };
}

interface CollectionEntry {
  id: string;
  name: string;
  tagline: string;
  description: string;
  plugins?: string[];
  autoFilter?: string;
}

interface BlogSummary {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  draft: boolean;
}

const SITE = 'https://plugins.jmeter.ai';
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);

function parseFrontmatterField(fm: string, key: string): string {
  const match = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!match) return '';
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function loadBlogPosts(): BlogSummary[] {
  const dir = path.resolve('src/content/blog');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
  const posts: BlogSummary[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    const draft = /^draft:\s*true/m.test(fm);
    if (draft) continue;
    // Astro 5/6 content loader lowercases file-based IDs by default
    const slug = file.replace(/\.(md|mdx)$/, '').toLowerCase();
    posts.push({
      slug,
      title: parseFrontmatterField(fm, 'title') || slug,
      description: parseFrontmatterField(fm, 'description'),
      pubDate: parseFrontmatterField(fm, 'pubDate'),
      draft,
    });
  }

  return posts.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
}

function buildLlmsTxt(
  plugins: PluginEntry[],
  collections: CollectionEntry[],
  posts: BlogSummary[],
): string {
  const topDownloaded = [...plugins]
    .sort((a, b) => (b.stats?.absoluteDownloads || 0) - (a.stats?.absoluteDownloads || 0))
    .slice(0, 10);
  const topTrending = [...plugins]
    .sort((a, b) => (b.stats?.trendingDelta || 0) - (a.stats?.trendingDelta || 0))
    .slice(0, 5);
  const generatedDate = new Date().toISOString().slice(0, 10);

  return [
    '# PerfAtlas',
    '',
    '> The modern directory for Apache JMeter plugins — search, discover, compare, and track the velocity and GitHub health of load testing extensions, with free browser-based JMeter tools and tutorials. Synced daily from the official JMeter Plugins registry.',
    '',
    `PerfAtlas (${SITE}) indexes **${plugins.length} Apache JMeter plugins**, **${collections.length} curated plugin stacks**, and **${posts.length} technical guides**. Maintained by NaveenKumar Namachivayam (QAInsights). Last generated: ${generatedDate}.`,
    '',
    '## Machine-Readable Endpoints for AI Agents',
    '',
    `- [Full LLM Context](${SITE}/llms-full.txt): Complete catalog of all ${plugins.length} plugins, collections, tools, and guides in a single file.`,
    `- [All Plugins JSON API](${SITE}/api/plugins.json): Full structured dataset of all ${plugins.length} plugins.`,
    `- [Trending Plugins JSON API](${SITE}/api/trending.json): Top 25 plugins ranked by weekly download delta.`,
    `- [Plugin Markdown Endpoint](${SITE}/plugin/{plugin-id}.md): Clean markdown summary, CLI install command, compatibility, and FAQs for any plugin (e.g., ${SITE}/plugin/jpgc-perfmon.md).`,
    `- [Blog Post Markdown Endpoint](${SITE}/blog/{slug}.md): Raw markdown for any tutorial.`,
    `- [Blog RSS Feed](${SITE}/rss.xml): Latest tutorials and guides.`,
    `- [XML Sitemap](${SITE}/sitemap-index.xml): Full site index with lastmod dates.`,
    '',
    '## Core Pages & Free Tools',
    '',
    `- [Plugin Directory](${SITE}/): Search, filter by category, track trends, and build install lists. Supports query search via \`/?q=<term>\`.`,
    `- [Compare Plugins](${SITE}/compare/): Side-by-side comparison table (\`?ids=jpgc-perfmon,jpgc-casutg\`).`,
    `- [JMeter Tools Hub](${SITE}/tools/): Free browser-based utilities for load testing.`,
    `- [JMeter CLI Command Builder](${SITE}/tools/cli-builder/): Visual builder for \`jmeter\` and \`PluginsManagerCMD\` commands.`,
    `- [JMeter Thread Calculator](${SITE}/tools/thread-calculator/): Calculate required threads from target RPS, response time, think time, and headroom.`,
    `- [Recently Updated Plugins](${SITE}/recently-updated/): Active plugins sorted by latest GitHub commit.`,
    `- [Potentially Abandoned Plugins](${SITE}/potentially-abandoned/): Stale or archived JMeter plugins to watch out for.`,
    `- [Vendors](${SITE}/vendor/): Browse plugins by author or organization.`,
    `- [Collections](${SITE}/collections/): Curated stacks for CI/CD, Observability, Load Shaping, and AI workflows.`,
    `- [Blog](${SITE}/blog/): ${posts.length} in-depth JMeter plugin guides and benchmarks.`,
    '',
    '## Curated Collections',
    '',
    ...collections.map(
      (c) => `- [${c.name}](${SITE}/collections/${c.id}/): ${c.tagline}`,
    ),
    '',
    `## Top 10 Most Downloaded Plugins (as of ${generatedDate})`,
    '',
    ...topDownloaded.map(
      (p, i) =>
        `${i + 1}. [${p.name}](${SITE}/plugin/${p.id}/) (\`${p.id}\`) — ${fmt(p.stats.absoluteDownloads)} downloads. ${p.description}`,
    ),
    '',
    '## Top 5 Trending This Week',
    '',
    ...topTrending.map(
      (p, i) =>
        `${i + 1}. [${p.name}](${SITE}/plugin/${p.id}/) (\`${p.id}\`) — +${fmt(p.stats.trendingDelta)} this week.`,
    ),
    '',
    `## Blog Guides (${posts.length} Published)`,
    '',
    ...posts.map(
      (post) =>
        `- [${post.title}](${SITE}/blog/${post.slug}/) ([Markdown](${SITE}/blog/${post.slug}.md))${post.description ? ` — ${post.description}` : ''}`,
    ),
    '',
    '## Maintainer & Links',
    '',
    '- Maintainer: NaveenKumar Namachivayam (https://qainsights.com)',
    '- GitHub: https://github.com/QAInsights/plugins.jmeter.ai',
    '- JMeter.ai: https://jmeter.ai',
    '- Pricing: 100% free and open source; no paywalls or API keys required.',
    '',
  ].join('\n');
}

function buildLlmsFullTxt(
  plugins: PluginEntry[],
  collections: CollectionEntry[],
  posts: BlogSummary[],
): string {
  const sortedPlugins = [...plugins].sort(
    (a, b) => (b.stats?.absoluteDownloads || 0) - (a.stats?.absoluteDownloads || 0),
  );
  const generatedDate = new Date().toISOString().slice(0, 10);

  const lines: string[] = [
    '# PerfAtlas — Full Directory Reference (llms-full.txt)',
    '',
    `> Complete catalog of all ${plugins.length} Apache JMeter plugins, ${collections.length} curated stacks, interactive tools, and ${posts.length} tutorials on ${SITE}. Generated: ${generatedDate}.`,
    '',
    '## Quick Install Reference',
    '',
    'Install any plugin via JMeter Plugins Manager CLI:',
    '```bash',
    'PluginsManagerCMD.sh install <plugin-id>',
    '```',
    '',
    '## Curated Collections',
    '',
    ...collections.flatMap((c) => [
      `### ${c.name} (${SITE}/collections/${c.id}/)`,
      c.description,
      c.plugins?.length ? `Plugins: ${c.plugins.join(', ')}` : 'Auto-populated stack.',
      '',
    ]),
    `## Complete Plugin Catalog (${plugins.length} Plugins)`,
    '',
    ...sortedPlugins.map((p) => {
      const parts = [
        `### ${p.name} (\`${p.id}\`)`,
        `- URL: ${SITE}/plugin/${p.id}/ | Markdown: ${SITE}/plugin/${p.id}.md`,
        `- Vendor: ${p.vendor} | Downloads: ${fmt(p.stats.absoluteDownloads)} | Weekly: ${p.stats.trendingDelta > 0 ? '+' : ''}${fmt(p.stats.trendingDelta)}`,
        ...(p.jmeterCompatibility ? [`- JMeter Compatibility: ${p.jmeterCompatibility}+`] : []),
        ...(p.githubInfo?.health
          ? [`- Repo Health: ${p.githubInfo.health.score}/100 (${p.githubInfo.health.label})`]
          : []),
        `- Install: \`PluginsManagerCMD.sh install ${p.id}\``,
        `- Summary: ${p.description}`,
        '',
      ];
      return parts.join('\n');
    }),
    `## Blog Tutorials (${posts.length} Articles)`,
    '',
    ...posts.map(
      (post) =>
        `- **${post.title}** (${post.pubDate.slice(0, 10)})\n  URL: ${SITE}/blog/${post.slug}/ | Markdown: ${SITE}/blog/${post.slug}.md\n  ${post.description}`,
    ),
    '',
  ];

  return lines.join('\n');
}

function main() {
  const plugins = JSON.parse(
    fs.readFileSync(path.resolve('src/data/plugins_data.json'), 'utf8'),
  ) as PluginEntry[];
  const collections = JSON.parse(
    fs.readFileSync(path.resolve('src/data/collections.json'), 'utf8'),
  ) as CollectionEntry[];
  const posts = loadBlogPosts();

  const llmsTxt = buildLlmsTxt(plugins, collections, posts);
  const llmsFullTxt = buildLlmsFullTxt(plugins, collections, posts);

  fs.writeFileSync(path.resolve('public/llms.txt'), llmsTxt, 'utf8');
  fs.writeFileSync(path.resolve('public/llms-full.txt'), llmsFullTxt, 'utf8');
  console.log(
    `[llms] Generated public/llms.txt (${Math.round(llmsTxt.length / 1024)} KB) and public/llms-full.txt (${Math.round(llmsFullTxt.length / 1024)} KB) — ${plugins.length} plugins, ${posts.length} posts.`,
  );
}

main();
