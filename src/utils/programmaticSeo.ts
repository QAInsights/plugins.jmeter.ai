import { inferCategory, type PluginCategory, type PluginLike } from './plugin';
import type { FaqItem } from './seoSchema';

export interface ProgrammaticPlugin extends PluginLike {
  name: string;
  description: string;
  vendor: string;
  helpUrl?: string;
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

export interface CategoryMeta {
  category: PluginCategory;
  slug: string;
  title: string;
  headline: string;
  intro: string;
  faqs: FaqItem[];
}

export const CATEGORY_DEFINITIONS: readonly CategoryMeta[] = [
  {
    category: 'Listeners',
    slug: 'listeners',
    title: 'JMeter Listener & Observability Plugins',
    headline: 'Listeners & Observability',
    intro:
      'Collect, stream, and visualize load test metrics in real time. Browse JMeter backend listeners, Prometheus/Grafana/Datadog exporters, custom file writers, and response-time graphs.',
    faqs: [
      {
        question: 'Which JMeter listener plugins are safe for headless CI/CD runs?',
        answer:
          'Avoid GUI-heavy graph listeners during load generation. Use Backend Listeners (such as Prometheus or InfluxDB exporters) and lightweight result writers in non-GUI mode (-n), and generate HTML reports after the run.',
      },
      {
        question: 'How do I stream live JMeter metrics to Grafana or Prometheus?',
        answer:
          'Install a listener plugin such as jmeter-prometheus or jpgc-perfmon via PluginsManagerCMD.sh install <plugin-id> and attach it to your Test Plan.',
      },
    ],
  },
  {
    category: 'Samplers',
    slug: 'samplers',
    title: 'JMeter Sampler & Protocol Plugins',
    headline: 'Samplers & Protocols',
    intro:
      'Extend Apache JMeter beyond HTTP with protocol samplers for gRPC, WebSocket, Kafka, MQTT, GraphQL, WebDriver, Dummy Sampler debugging, and cloud messaging.',
    faqs: [
      {
        question: 'Can JMeter load test gRPC, WebSocket, Kafka, and MQTT?',
        answer:
          'Yes. Dedicated sampler plugins in the JMeter Plugins registry add native support for gRPC microservices, WebSockets, Apache Kafka (including Avro/Protobuf), and MQTT IoT brokers.',
      },
      {
        question: 'What is the best JMeter sampler for debugging test plans locally?',
        answer:
          'Dummy Sampler (jpgc-dummy) generates synthetic HTTP/JSON responses with zero network overhead so you can verify extractors, assertions, and correlation logic before hitting a live server.',
      },
    ],
  },
  {
    category: 'Timers',
    slug: 'timers',
    title: 'JMeter Timer & Throughput Shaping Plugins',
    headline: 'Timers & Throughput Shaping',
    intro:
      'Control request pacing, realistic user think time, and exact requests-per-second (RPS) load schedules with JMeter timer plugins like Throughput Shaping Timer.',
    faqs: [
      {
        question: 'How do I hold a precise RPS target in JMeter?',
        answer:
          'Use Throughput Shaping Timer (jpgc-tst) paired with Concurrency Thread Group (jpgc-casutg) and the tstFeedback function to maintain exact RPS schedules with minimal variance.',
      },
      {
        question: 'Why does think time matter in JMeter load tests?',
        answer:
          'Without timers, threads fire requests back-to-back and produce unrealistic arrival patterns. Timers simulate real user pauses between actions.',
      },
    ],
  },
  {
    category: 'Configs',
    slug: 'configs',
    title: 'JMeter Config & Test Data Plugins',
    headline: 'Configs & Test Data',
    intro:
      'Manage parameterized test data, randomized CSV datasets, connection pools, and shared inter-thread variables across distributed JMeter runs.',
    faqs: [
      {
        question: 'How do I read random rows from a CSV file in JMeter?',
        answer:
          'Install the Random CSV Data Set Config plugin (bzm-random-csv) via Plugins Manager to sample CSV rows randomly without sequential ordering bias.',
      },
    ],
  },
  {
    category: 'Assertions',
    slug: 'assertions',
    title: 'JMeter Assertion & Validation Plugins',
    headline: 'Assertions & Validation',
    intro:
      'Validate JSON payloads, XML schemas, SLA thresholds, and API response contracts automatically during performance test execution.',
    faqs: [
      {
        question: 'Do JMeter assertions slow down high-throughput load tests?',
        answer:
          'Lightweight status-code and targeted JSON assertions have minimal overhead, while heavy regex or full-body XML/XPath checks on large payloads can consume CPU on load generators.',
      },
    ],
  },
  {
    category: 'Processors',
    slug: 'processors',
    title: 'JMeter Pre-Processor & Post-Processor Plugins',
    headline: 'Pre & Post-Processors',
    intro:
      'Extract dynamic tokens, sign JWT/OAuth requests, correlate responses, and transform payloads before and after JMeter samplers execute.',
    faqs: [
      {
        question: 'When should I use a Pre-Processor vs a Post-Processor in JMeter?',
        answer:
          'Use Pre-Processors to prepare request inputs (such as signing tokens or generating test payloads) before a sampler runs, and Post-Processors to extract values from responses for downstream requests.',
      },
    ],
  },
  {
    category: 'Others',
    slug: 'thread-groups-and-utilities',
    title: 'JMeter Thread Groups, Controllers & Utility Plugins',
    headline: 'Thread Groups & Utilities',
    intro:
      'Advanced workload modeling with Custom Thread Groups (Ultimate, Concurrency, Stepping, Arrivals), Parallel Controller, CLI tools, and test-plan utilities.',
    faqs: [
      {
        question: 'Which JMeter thread group plugin should I use?',
        answer:
          'Use Concurrency Thread Group for closed-workload concurrency targets, Arrivals Thread Group for open-workload arrival rates, and Ultimate Thread Group for custom multi-stage step/spike profiles.',
      },
    ],
  },
];

export function categoryToSlug(category: PluginCategory): string {
  return (
    CATEGORY_DEFINITIONS.find((c) => c.category === category)?.slug ?? 'thread-groups-and-utilities'
  );
}

export function getCategorySummaries<T extends ProgrammaticPlugin>(plugins: readonly T[]) {
  return CATEGORY_DEFINITIONS.map((meta) => {
    const items = plugins
      .filter((p) => inferCategory(p) === meta.category)
      .sort((a, b) => (b.stats?.absoluteDownloads ?? 0) - (a.stats?.absoluteDownloads ?? 0));
    const totalDownloads = items.reduce((sum, p) => sum + (p.stats?.absoluteDownloads ?? 0), 0);
    return {
      ...meta,
      plugins: items,
      pluginCount: items.length,
      totalDownloads,
    };
  }).filter((summary) => summary.pluginCount > 0);
}

export function getAlternativesForPlugin<T extends ProgrammaticPlugin>(
  target: T,
  allPlugins: readonly T[],
  limit = 6,
): T[] {
  const category = inferCategory(target);
  // "Others" is a catch-all bucket containing unrelated utilities (e.g., Plugins Manager,
  // Custom Thread Groups, CLI tools); never recommend unrelated catch-all plugins as replacements.
  if (category === 'Others') return [];
  return allPlugins
    .filter((p) => p.id !== target.id && inferCategory(p) === category)
    .sort((a, b) => {
      // Prioritize healthier active alternatives, then downloads
      const aArchived = a.githubInfo?.health?.label === 'Archived' ? 1 : 0;
      const bArchived = b.githubInfo?.health?.label === 'Archived' ? 1 : 0;
      if (aArchived !== bArchived) return aArchived - bArchived;
      return (b.stats?.absoluteDownloads ?? 0) - (a.stats?.absoluteDownloads ?? 0);
    })
    .slice(0, limit);
}

export interface ComparisonPair<T extends ProgrammaticPlugin> {
  slug: string;
  category: PluginCategory;
  pluginA: T;
  pluginB: T;
}

/**
 * Generate deterministic, high-value "X vs Y" comparison pairs within the same
 * functional category (excluding the catch-all "Others" bucket).
 */
export function getTopComparisonPairs<T extends ProgrammaticPlugin>(
  plugins: readonly T[],
  maxPairs = 30,
): Array<ComparisonPair<T>> {
  const pairs: Array<ComparisonPair<T> & { score: number }> = [];
  const seen = new Set<string>();

  for (const def of CATEGORY_DEFINITIONS) {
    if (def.category === 'Others') continue;
    const topInCategory = plugins
      .filter((p) => inferCategory(p) === def.category)
      .sort((a, b) => (b.stats?.absoluteDownloads ?? 0) - (a.stats?.absoluteDownloads ?? 0))
      .slice(0, 6);

    for (let i = 0; i < topInCategory.length; i++) {
      for (let j = i + 1; j < topInCategory.length; j++) {
        const first = topInCategory[i];
        const second = topInCategory[j];
        // Skip IDs containing '/' or characters unsafe for single URL segment
        if (!/^[a-z0-9._-]+$/i.test(first.id) || !/^[a-z0-9._-]+$/i.test(second.id)) continue;
        const [a, b] = first.id.localeCompare(second.id) <= 0 ? [first, second] : [second, first];
        const slug = `${a.id}-vs-${b.id}`;
        if (seen.has(slug)) continue;
        seen.add(slug);
        const score = (a.stats?.absoluteDownloads ?? 0) + (b.stats?.absoluteDownloads ?? 0);
        pairs.push({ slug, category: def.category, pluginA: a, pluginB: b, score });
      }
    }
  }

  return pairs
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPairs)
    .map(({ slug, category, pluginA, pluginB }) => ({ slug, category, pluginA, pluginB }));
}
