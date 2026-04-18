import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import PluginModal from '../../src/components/PluginModal.astro';

async function render() {
  const container = await AstroContainer.create();
  const html = await container.renderToString(PluginModal);
  return { html };
}

describe('PluginModal', () => {
  it('should render dialog#pluginModal', async () => {
    const { html } = await render();
    expect(html).toContain('id="pluginModal"');
  });

  it('should render #modalClose button', async () => {
    const { html } = await render();
    expect(html).toContain('id="modalClose"');
  });

  it('should render #modalTitle element', async () => {
    const { html } = await render();
    expect(html).toContain('id="modalTitle"');
  });

  it('should render #modalVendor element', async () => {
    const { html } = await render();
    expect(html).toContain('id="modalVendor"');
  });

  it('should render #modalDescription element', async () => {
    const { html } = await render();
    expect(html).toContain('id="modalDescription"');
  });

  it('should render #modalScreenshot element', async () => {
    const { html } = await render();
    expect(html).toContain('id="modalScreenshot"');
  });

  it('should render #modalClassesWrapper and #modalClasses', async () => {
    const { html } = await render();
    expect(html).toContain('id="modalClassesWrapper"');
    expect(html).toContain('id="modalClasses"');
  });

  it('should render #modalDownloads element', async () => {
    const { html } = await render();
    expect(html).toContain('id="modalDownloads"');
  });

  it('should render #modalTrending element', async () => {
    const { html } = await render();
    expect(html).toContain('id="modalTrending"');
  });

  it('should render #usageChart canvas', async () => {
    const { html } = await render();
    expect(html).toContain('id="usageChart"');
  });

  it('should render #modalBadgeContainer', async () => {
    const { html } = await render();
    expect(html).toContain('id="modalBadgeContainer"');
  });

  it('should render #modalCopyBadgeBtn', async () => {
    const { html } = await render();
    expect(html).toContain('id="modalCopyBadgeBtn"');
  });

  it('should render #modalInstallBtn', async () => {
    const { html } = await render();
    expect(html).toContain('id="modalInstallBtn"');
  });

  it('should render #modalDeepLink', async () => {
    const { html } = await render();
    expect(html).toContain('id="modalDeepLink"');
  });

  it('should render #modalLink', async () => {
    const { html } = await render();
    expect(html).toContain('id="modalLink"');
  });

  it('should render #modalHeaderBg', async () => {
    const { html } = await render();
    expect(html).toContain('id="modalHeaderBg"');
  });

  it('should use dialog element', async () => {
    const { html } = await render();
    expect(html).toContain('<dialog');
  });

  it('should render "Repository" link text', async () => {
    const { html } = await render();
    expect(html).toContain('Repository');
  });

  it('should render "Stats Page" link text', async () => {
    const { html } = await render();
    expect(html).toContain('Stats Page');
  });

  it('should render "Embed on GitHub" section', async () => {
    const { html } = await render();
    expect(html).toContain('Embed on GitHub');
  });

  it('should render "Component Classes" section', async () => {
    const { html } = await render();
    expect(html).toContain('Component Classes');
  });

  it('should render "Usage History" section', async () => {
    const { html } = await render();
    expect(html).toContain('Usage History');
  });
});
