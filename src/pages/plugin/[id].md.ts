import type { APIRoute, GetStaticPaths } from 'astro';
import pluginsData from '../../data/plugins_data.json';
import { getChangelogTimeline, inferCategory, vendorSlug } from '../../utils/plugin';
import { buildPluginFaqs, getLatestPluginVersion } from '../../utils/seoSchema';

export const prerender = true;

export const getStaticPaths: GetStaticPaths = () => {
  return pluginsData.map((plugin) => ({
    params: { id: plugin.id },
    props: { plugin },
  }));
};

export const GET: APIRoute = ({ props }) => {
  const plugin = (props as { plugin: (typeof pluginsData)[number] }).plugin;
  const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const category = inferCategory(plugin);
  const latestVersion = getLatestPluginVersion(plugin.versions);
  const changelog = getChangelogTimeline(plugin).slice(0, 10);
  const faqs = buildPluginFaqs(plugin);

  const lines: string[] = [
    `# ${plugin.name}`,
    '',
    `> ${plugin.description}`,
    '',
    `- **Plugin ID**: \`${plugin.id}\``,
    `- **Vendor**: ${plugin.vendor} (https://plugins.jmeter.ai/vendor/${vendorSlug(plugin.vendor)}/)`,
    `- **Category**: ${category}`,
    `- **Canonical URL**: https://plugins.jmeter.ai/plugin/${plugin.id}/`,
    `- **Total Downloads**: ${fmt(plugin.stats?.absoluteDownloads || 0)}`,
    `- **Downloads This Week**: ${(plugin.stats?.trendingDelta || 0) > 0 ? '+' : ''}${fmt(plugin.stats?.trendingDelta || 0)}`,
  ];

  if (latestVersion) lines.push(`- **Latest Version**: ${latestVersion}`);
  if (plugin.jmeterCompatibility) {
    lines.push(`- **JMeter Compatibility**: ${plugin.jmeterCompatibility}+`);
  }
  if (plugin.githubInfo?.license) lines.push(`- **License**: ${plugin.githubInfo.license}`);
  if (plugin.githubInfo?.stars !== undefined) {
    lines.push(`- **GitHub Stars**: ${fmt(plugin.githubInfo.stars)}`);
  }
  if (plugin.githubInfo?.health) {
    lines.push(
      `- **Repository Health**: ${plugin.githubInfo.health.score}/100 (${plugin.githubInfo.health.label})`,
    );
  }
  if (plugin.helpUrl) lines.push(`- **Repository / Docs**: ${plugin.helpUrl}`);

  lines.push(
    '',
    '## Install via JMeter Plugins Manager CLI',
    '',
    '```bash',
    `PluginsManagerCMD.sh install ${plugin.id}`,
    '```',
    '',
    'Windows:',
    '',
    '```bat',
    `PluginsManagerCMD.bat install ${plugin.id}`,
    '```',
  );

  if (plugin.componentClasses && plugin.componentClasses.length > 0) {
    lines.push(
      '',
      '## Component Classes',
      '',
      ...plugin.componentClasses.map((cls: string) => `- \`${cls}\``),
    );
  }

  if (changelog.length > 0) {
    lines.push(
      '',
      '## Recent Releases',
      '',
      ...changelog.map((entry) => `- **${entry.version}**: ${entry.changes || 'Release update'}`),
    );
  }

  lines.push(
    '',
    '## Frequently Asked Questions',
    '',
    ...faqs.flatMap((faq) => [`### ${faq.question}`, '', faq.answer, '']),
  );

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
