import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import CollectionCard from '../../src/components/CollectionCard.astro';
import type { CollectionSummary } from '../../src/utils/collection';

function makePlugin(id: string, name?: string) {
  return { id, name: name ?? `Plugin ${id}`, vendor: 'TestVendor', stats: { absoluteDownloads: 1000, trendingDelta: 10 } };
}

function makeSummary(overrides: Partial<CollectionSummary> = {}): CollectionSummary {
  return {
    id: 'ci-cd-stack',
    name: 'CI/CD Stack',
    emoji: '🚦',
    tagline: 'Headless-friendly plugins for pipelines.',
    pluginCount: 3,
    previewPlugins: [makePlugin('jpgc-plancheck'), makePlugin('jpgc-autostop'), makePlugin('jpgc-synthesis')],
    totalDownloads: 123456,
    aiReadyCount: 0,
    ...overrides,
  };
}

async function render(summary: CollectionSummary) {
  const container = await AstroContainer.create();
  const html = await container.renderToString(CollectionCard, {
    props: { collection: summary },
  });
  return { html };
}

describe('CollectionCard', () => {
  it('renders the collection name', async () => {
    const { html } = await render(makeSummary());
    expect(html).toContain('CI/CD Stack');
  });

  it('renders the tagline', async () => {
    const { html } = await render(makeSummary());
    expect(html).toContain('Headless-friendly plugins for pipelines.');
  });

  it('renders plugin count pill', async () => {
    const { html } = await render(makeSummary({ pluginCount: 5 }));
    expect(html).toContain('5 plugins');
  });

  it('renders first 3 preview plugin IDs', async () => {
    const { html } = await render(makeSummary());
    expect(html).toContain('jpgc-plancheck');
    expect(html).toContain('jpgc-autostop');
    expect(html).toContain('jpgc-synthesis');
  });

  it('renders +N more badge when pluginCount > 3', async () => {
    const { html } = await render(makeSummary({ pluginCount: 7, previewPlugins: [makePlugin('a'), makePlugin('b'), makePlugin('c')] }));
    expect(html).toContain('+4 more');
  });

  it('does NOT render +N more when pluginCount equals preview count', async () => {
    const { html } = await render(makeSummary({ pluginCount: 3 }));
    expect(html).not.toContain('more');
  });

  it('links to the correct /collections/:id URL', async () => {
    const { html } = await render(makeSummary({ id: 'ci-cd-stack' }));
    expect(html).toContain('href="/collections/ci-cd-stack"');
  });

  it('renders "View Stack" affordance', async () => {
    const { html } = await render(makeSummary());
    expect(html).toContain('View Stack');
  });

  it('renders formatted total downloads', async () => {
    const { html } = await render(makeSummary({ totalDownloads: 123456 }));
    expect(html).toContain('123,456');
  });

  it('renders the emoji', async () => {
    const { html } = await render(makeSummary({ emoji: '📡' }));
    expect(html).toContain('📡');
  });

  it('renders with zero preview plugins gracefully', async () => {
    const { html } = await render(makeSummary({ pluginCount: 0, previewPlugins: [] }));
    expect(html).toContain('CI/CD Stack');
    expect(html).not.toContain('data-href');
  });
});
