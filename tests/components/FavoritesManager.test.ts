import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import FavoritesManager from '../../src/components/FavoritesManager.astro';

async function render() {
  const container = await AstroContainer.create();
  const html = await container.renderToString(FavoritesManager);
  return { html };
}

describe('FavoritesManager', () => {
  it('should render the import banner element', async () => {
    const { html } = await render();
    expect(html).toContain('id="favImportBanner"');
  });

  it('should render the banner hidden by default', async () => {
    const { html } = await render();
    expect(html).toContain('favImportBanner');
    expect(html).toContain('hidden');
  });

  it('should render the Merge button', async () => {
    const { html } = await render();
    expect(html).toContain('id="favImportMerge"');
    expect(html).toContain('Merge');
  });

  it('should render the Dismiss button', async () => {
    const { html } = await render();
    expect(html).toContain('id="favImportDismiss"');
    expect(html).toContain('Dismiss');
  });

  it('should render the import message element', async () => {
    const { html } = await render();
    expect(html).toContain('id="favImportMsg"');
  });

  it('should embed an inline script', async () => {
    const { html } = await render();
    expect(html).toContain('__favorites');
    expect(html).toContain('favoriteIds');
  });

  it('should reference the favoriteIds localStorage key', async () => {
    const { html } = await render();
    expect(html).toContain('favoriteIds');
  });

  it('should reference the favorites:update event', async () => {
    const { html } = await render();
    expect(html).toContain('favorites:update');
  });
});
