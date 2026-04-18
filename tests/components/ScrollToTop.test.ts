import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import ScrollToTop from '../../src/components/ScrollToTop.astro';

async function render() {
  const container = await AstroContainer.create();
  const html = await container.renderToString(ScrollToTop);
  return { html };
}

describe('ScrollToTop', () => {
  it('should render button with id scrollToTopBtn', async () => {
    const { html } = await render();
    expect(html).toContain('id="scrollToTopBtn"');
  });

  it('should have aria-label="Scroll to top"', async () => {
    const { html } = await render();
    expect(html).toContain('aria-label="Scroll to top"');
  });

  it('should contain an SVG child', async () => {
    const { html } = await render();
    expect(html).toContain('<svg');
  });

  it('should have initial hidden classes (opacity-0, translate-y-20)', async () => {
    const { html } = await render();
    expect(html).toContain('opacity-0');
    expect(html).toContain('translate-y-20');
  });

  it('should have pointer-events-none initially', async () => {
    const { html } = await render();
    expect(html).toContain('pointer-events-none');
  });

  it('should be a fixed positioned button', async () => {
    const { html } = await render();
    expect(html).toContain('fixed');
  });
});
