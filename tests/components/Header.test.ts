import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Header from '../../src/components/Header.astro';

async function render() {
  const container = await AstroContainer.create();
  const html = await container.renderToString(Header);
  return { html };
}

describe('Header', () => {
  it('should render PerfAtlas branding', async () => {
    const { html } = await render();
    expect(html).toContain('PerfAtlas');
  });

  it('should render Home link', async () => {
    const { html } = await render();
    expect(html).toContain('href="/"');
    expect(html).toContain('Home');
  });

  it('should render Blog link', async () => {
    const { html } = await render();
    expect(html).toContain('href="/blog"');
    expect(html).toContain('Blog');
  });

  it('should render #themeToggle button', async () => {
    const { html } = await render();
    expect(html).toContain('id="themeToggle"');
  });

  it('should render GitHub repository link', async () => {
    const { html } = await render();
    expect(html).toContain('https://github.com/QAInsights/plugins.jmeter.ai');
  });

  it('should render Donate button', async () => {
    const { html } = await render();
    expect(html).toContain('buymeacoffee.com/qainsights');
  });

  it('should be sticky header', async () => {
    const { html } = await render();
    expect(html).toContain('sticky');
  });

  it('should render theme icons', async () => {
    const { html } = await render();
    expect(html).toContain('id="themeIconDark"');
    expect(html).toContain('id="themeIconLight"');
  });
});
