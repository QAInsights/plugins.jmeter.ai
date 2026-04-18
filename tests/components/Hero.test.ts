import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Hero from '../../src/components/Hero.astro';

async function render() {
  const container = await AstroContainer.create();
  const html = await container.renderToString(Hero);
  return { html };
}

describe('Hero', () => {
  it('should render h1 heading with JMeter copy', async () => {
    const { html } = await render();
    expect(html).toContain('Power up');
    expect(html).toContain('JMeter');
  });

  it('should render #searchInput', async () => {
    const { html } = await render();
    expect(html).toContain('id="searchInput"');
  });

  it('should render #clearSearchBtn', async () => {
    const { html } = await render();
    expect(html).toContain('id="clearSearchBtn"');
  });

  it('should have clearSearchBtn initially hidden', async () => {
    const { html } = await render();
    expect(html).toContain('class="hidden');
  });

  it('should embed StarMap (starMapContainer)', async () => {
    const { html } = await render();
    expect(html).toContain('id="starMapContainer"');
  });

  it('should have search placeholder text', async () => {
    const { html } = await render();
    expect(html).toContain('Search plugins');
  });
});
