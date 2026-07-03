import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Tooltip from '../../src/components/Tooltip.astro';

async function render(props = {}, slots = {}) {
  const container = await AstroContainer.create();
  const html = await container.renderToString(Tooltip, {
    props,
    slots: {
      trigger: '<span>Trigger Element</span>',
      content: '<span>Tooltip Content</span>',
      ...slots,
    },
  });
  return { html };
}

describe('Tooltip', () => {
  it('should render trigger slot content', async () => {
    const { html } = await render();
    expect(html).toContain('Trigger Element');
  });

  it('should render tooltip content slot', async () => {
    const { html } = await render();
    expect(html).toContain('Tooltip Content');
  });

  it('should support custom position (top/bottom/left/right)', async () => {
    const { html: htmlTop } = await render({ position: 'top' });
    expect(htmlTop).toContain('bottom-full');

    const { html: htmlBottom } = await render({ position: 'bottom' });
    expect(htmlBottom).toContain('top-full');

    const { html: htmlLeft } = await render({ position: 'left' });
    expect(htmlLeft).toContain('right-full');

    const { html: htmlRight } = await render({ position: 'right' });
    expect(htmlRight).toContain('left-full');
  });
});
