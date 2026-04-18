import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Footer from '../../src/components/Footer.astro';

async function render() {
  const container = await AstroContainer.create();
  const html = await container.renderToString(Footer);
  return { html };
}

describe('Footer', () => {
  it('should render PerfAtlas branding', async () => {
    const { html } = await render();
    expect(html).toContain('PerfAtlas');
  });

  it('should render copyright with current year', async () => {
    const { html } = await render();
    const year = new Date().getFullYear().toString();
    expect(html).toContain(year);
  });

  it('should render "NaveenKumar Namachivayam" author credit', async () => {
    const { html } = await render();
    expect(html).toContain('NaveenKumar Namachivayam');
  });

  it('should render "Last directory sync" label', async () => {
    const { html } = await render();
    expect(html).toContain('Last directory sync');
  });

  it('should render Platform section with Blog link', async () => {
    const { html } = await render();
    expect(html).toContain('Platform');
    expect(html).toContain('href="/blog"');
  });

  it('should render Network section', async () => {
    const { html } = await render();
    expect(html).toContain('Network');
  });

  it('should render social links (X, YouTube, LinkedIn, GitHub)', async () => {
    const { html } = await render();
    expect(html).toContain('x.com/qainsights');
    expect(html).toContain('youtube.com/@qainsights');
    expect(html).toContain('linkedin.com/in/naveenkumarn');
    expect(html).toContain('github.com/qainsights');
  });
});
