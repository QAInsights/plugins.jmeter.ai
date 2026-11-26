import { describe, it, expect } from 'vitest';
import {
  buildBreadcrumbSchema,
  buildFaqSchema,
  buildItemListSchema,
  buildPluginFaqs,
  getLatestPluginVersion,
  toAbsoluteUrl,
} from '../../src/utils/seoSchema';

describe('seoSchema helpers', () => {
  it('converts relative paths to absolute URLs and preserves absolute URLs', () => {
    expect(toAbsoluteUrl('/plugin/jpgc-perfmon/')).toBe(
      'https://plugins.jmeter.ai/plugin/jpgc-perfmon/',
    );
    expect(toAbsoluteUrl('blog/')).toBe('https://plugins.jmeter.ai/blog/');
    expect(toAbsoluteUrl('https://example.com/x')).toBe('https://example.com/x');
  });

  it('builds valid BreadcrumbList schema with 1-based positions', () => {
    const schema = buildBreadcrumbSchema([
      { name: 'Home', url: '/' },
      { name: 'PerfMon', url: '/plugin/jpgc-perfmon/' },
    ]);
    expect(schema['@type']).toBe('BreadcrumbList');
    expect(schema.itemListElement).toHaveLength(2);
    expect(schema.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://plugins.jmeter.ai/',
    });
    expect(schema.itemListElement[1].item).toBe('https://plugins.jmeter.ai/plugin/jpgc-perfmon/');
  });

  it('builds valid ItemList schema', () => {
    const schema = buildItemListSchema('Top Plugins', [
      { name: 'PerfMon', url: '/plugin/jpgc-perfmon/', description: 'Server monitoring' },
    ]);
    expect(schema['@type']).toBe('ItemList');
    expect(schema.numberOfItems).toBe(1);
    expect(schema.itemListElement[0].url).toBe('https://plugins.jmeter.ai/plugin/jpgc-perfmon/');
  });

  it('extracts highest semantic version from versions object', () => {
    expect(getLatestPluginVersion({ '1.2': {}, '1.10': {}, '1.3': {} })).toBe('1.10');
    expect(getLatestPluginVersion({})).toBeNull();
    expect(getLatestPluginVersion(undefined)).toBeNull();
  });

  it('generates 5 plugin FAQs with install command, license, compatibility, and health', () => {
    const faqs = buildPluginFaqs({
      id: 'jpgc-perfmon',
      name: 'PerfMon Server Monitoring',
      vendor: 'jmeter-plugins.org',
      jmeterCompatibility: '5.5',
      githubInfo: {
        license: 'Apache-2.0',
        health: { score: 85, label: 'Active', lastCommitAt: '2026-10-01T00:00:00Z' },
      },
    });
    expect(faqs).toHaveLength(5);
    expect(faqs[0].answer).toContain('PluginsManagerCMD.sh install jpgc-perfmon');
    expect(faqs[1].answer).toContain('Apache-2.0');
    expect(faqs[2].answer).toContain('5.5');
    expect(faqs[3].answer).toContain('85/100 (Active)');
    expect(faqs[4].answer).toContain('jmeter-plugins.org');

    const faqSchema = buildFaqSchema(faqs);
    expect(faqSchema['@type']).toBe('FAQPage');
    expect(faqSchema.mainEntity).toHaveLength(5);
  });
});
