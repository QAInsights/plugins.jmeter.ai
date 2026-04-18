import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import BadgesPromotion from '../../src/components/BadgesPromotion.astro';

async function render() {
  const container = await AstroContainer.create();
  const html = await container.renderToString(BadgesPromotion);
  return { html };
}

describe('BadgesPromotion', () => {
  it('should render "Showcase Your Plugin on GitHub" heading', async () => {
    const { html } = await render();
    expect(html).toContain('Showcase Your Plugin on GitHub');
  });

  it('should render "Get Badge" link', async () => {
    const { html } = await render();
    expect(html).toContain('Get Badge');
  });

  it('should link to #pluginGrid', async () => {
    const { html } = await render();
    expect(html).toContain('href="#pluginGrid"');
  });

  it('should contain badge preview section', async () => {
    const { html } = await render();
    expect(html).toContain('Preview');
    expect(html).toContain('PerfAtlas');
  });
});
