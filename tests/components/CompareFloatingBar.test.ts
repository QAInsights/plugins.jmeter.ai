import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import CompareFloatingBar from '../../src/components/CompareFloatingBar.astro';

async function render() {
  const container = await AstroContainer.create();
  const html = await container.renderToString(CompareFloatingBar);
  return { html };
}

describe('CompareFloatingBar', () => {
  it('should render #compareBar', async () => {
    const { html } = await render();
    expect(html).toContain('id="compareBar"');
  });

  it('should be hidden by default (hidden class)', async () => {
    const { html } = await render();
    expect(html).toContain('hidden');
  });

  it('should have translate-y-32 for off-screen positioning', async () => {
    const { html } = await render();
    expect(html).toContain('translate-y-32');
  });

  it('should render #compareCount element', async () => {
    const { html } = await render();
    expect(html).toContain('id="compareCount"');
  });

  it('should render #compareStatus element', async () => {
    const { html } = await render();
    expect(html).toContain('id="compareStatus"');
  });

  it('should render #clearCompare button', async () => {
    const { html } = await render();
    expect(html).toContain('id="clearCompare"');
  });

  it('should render #compareBtn link', async () => {
    const { html } = await render();
    expect(html).toContain('id="compareBtn"');
  });

  it('should render "Compare Now" text', async () => {
    const { html } = await render();
    expect(html).toContain('Compare Now');
  });

  it('should render #compareThumbnails container', async () => {
    const { html } = await render();
    expect(html).toContain('id="compareThumbnails"');
  });

  it('should have compare link pointing to /compare', async () => {
    const { html } = await render();
    expect(html).toContain('href="/compare"');
  });
});
