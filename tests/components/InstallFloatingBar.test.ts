import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import InstallFloatingBar from '../../src/components/InstallFloatingBar.astro';

async function render() {
  const container = await AstroContainer.create();
  const html = await container.renderToString(InstallFloatingBar);
  return { html };
}

describe('InstallFloatingBar', () => {
  it('should render #installBar', async () => {
    const { html } = await render();
    expect(html).toContain('id="installBar"');
  });

  it('should be hidden by default (hidden class)', async () => {
    const { html } = await render();
    expect(html).toContain('hidden');
  });

  it('should have translate-y-32 for off-screen positioning', async () => {
    const { html } = await render();
    expect(html).toContain('translate-y-32');
  });

  it('should render #installCount element', async () => {
    const { html } = await render();
    expect(html).toContain('id="installCount"');
  });

  it('should render #installCmdText with default command', async () => {
    const { html } = await render();
    expect(html).toContain('id="installCmdText"');
    expect(html).toContain('PluginsManagerCMD.sh install');
  });

  it('should render #clearInstall button', async () => {
    const { html } = await render();
    expect(html).toContain('id="clearInstall"');
  });

  it('should render #copyInstallCmd button', async () => {
    const { html } = await render();
    expect(html).toContain('id="copyInstallCmd"');
  });

  it('should render "Install Plugins" heading', async () => {
    const { html } = await render();
    expect(html).toContain('Install Plugins');
  });

  it('should be fixed positioned', async () => {
    const { html } = await render();
    expect(html).toContain('fixed');
  });
});
