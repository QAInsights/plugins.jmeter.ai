import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import EthicalAd from '../../src/components/EthicalAd.astro';

async function render(props: Record<string, unknown> = {}) {
  const container = await AstroContainer.create();
  return container.renderToString(EthicalAd, {
    props: { publisher: 'qainsightscom', ...props },
  });
}

describe('EthicalAd', () => {
  it('renders a single slot for the qainsightscom publisher', async () => {
    const html = await render();
    expect(html.match(/class="ea-slot/g)).toHaveLength(1);
    expect(html).toContain('data-ea-publisher="qainsightscom"');
  });

  it('limits campaigns to paid and publisher house ads', async () => {
    const html = await render();
    expect(html).toContain('data-ea-campaign-types="paid|publisher-house"');
  });

  it('follows the site theme toggle for dark mode', async () => {
    const html = await render();
    expect(html).toContain('data-ea-dark-selector="html.dark"');
  });

  it('sends site keywords followed by page keywords', async () => {
    const html = await render({ keywords: ['Kafka', 'Load Testing'] });
    expect(html).toContain('data-ea-keywords="jmeter|performance-testing|load-testing|kafka"');
  });

  it('loads the EthicalAds client', async () => {
    const html = await render();
    expect(html).toContain('https://media.ethicalads.io/media/client/ethicalads.min.js');
  });
});
