export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface ItemListEntry {
  name: string;
  url: string;
  description?: string;
}

const SITE_BASE = 'https://plugins.jmeter.ai';

export function toAbsoluteUrl(urlOrPath: string): string {
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  const normalized = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
  return `${SITE_BASE}${normalized}`;
}

export function buildBreadcrumbSchema(items: readonly BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: toAbsoluteUrl(item.url),
    })),
  };
}

export function buildItemListSchema(name: string, entries: readonly ItemListEntry[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: entry.name,
      url: toAbsoluteUrl(entry.url),
      ...(entry.description ? { description: entry.description } : {}),
    })),
  };
}

export function buildFaqSchema(faqs: readonly FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function getLatestPluginVersion(versions?: Record<string, unknown> | null): string | null {
  if (!versions || typeof versions !== 'object') return null;
  const keys = Object.keys(versions).filter(Boolean);
  if (keys.length === 0) return null;
  keys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  return keys[keys.length - 1] ?? null;
}

export function buildPluginFaqs(plugin: {
  id: string;
  name: string;
  vendor: string;
  jmeterCompatibility?: string | null;
  githubInfo?: {
    license?: string | null;
    health?: { score: number; label: string; lastCommitAt?: string | null } | null;
  } | null;
  stats?: { absoluteDownloads?: number } | null;
}): FaqItem[] {
  const license = plugin.githubInfo?.license?.trim();
  const health = plugin.githubInfo?.health;
  const latestCommit = health?.lastCommitAt
    ? new Date(health.lastCommitAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  const faqs: FaqItem[] = [
    {
      question: `How do I install ${plugin.name} in JMeter?`,
      answer: `Install ${plugin.name} via the JMeter Plugins Manager GUI (Options > Plugins Manager, search "${plugin.name}"), or from the command line using PluginsManagerCMD.sh install ${plugin.id} (PluginsManagerCMD.bat install ${plugin.id} on Windows).`,
    },
    {
      question: `Is ${plugin.name} free and open source?`,
      answer: license
        ? `Yes, ${plugin.name} is free to use and distributed under the ${license} license via the official JMeter Plugins registry.`
        : `Yes, ${plugin.name} is free to install and use via the official JMeter Plugins registry.`,
    },
    {
      question: `Which Apache JMeter versions support ${plugin.name}?`,
      answer: plugin.jmeterCompatibility
        ? `${plugin.name} declares compatibility with Apache JMeter ${plugin.jmeterCompatibility} and later.`
        : `${plugin.name} is compatible with modern Apache JMeter 5.x releases via the JMeter Plugins Manager. Check the repository for version-specific notes.`,
    },
    {
      question: `Is ${plugin.name} still actively maintained?`,
      answer: health
        ? `${plugin.name} currently has a PerfAtlas repository health score of ${health.score}/100 (${health.label})${latestCommit ? `, with its last recorded GitHub commit on ${latestCommit}` : ''}.`
        : `${plugin.name} is indexed in the official JMeter Plugins registry. Check the linked repository for the latest commit and release history.`,
    },
    {
      question: `Who maintains ${plugin.name}?`,
      answer: `${plugin.name} (plugin ID: ${plugin.id}) is maintained by ${plugin.vendor}.`,
    },
  ];

  return faqs;
}
