import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import FeaturedTrending from '../../src/components/FeaturedTrending.astro';
import { makePluginsList } from '../fixtures/plugins';

async function render(trendingPlugins: any[]) {
  const container = await AstroContainer.create();
  const html = await container.renderToString(FeaturedTrending, {
    props: { trendingPlugins },
  });
  return { html };
}

describe('FeaturedTrending', () => {
  it('should render "Featured" heading', async () => {
    const { html } = await render([]);
    expect(html).toContain('Featured');
  });

  it('should render "Hot This Week" heading', async () => {
    const { html } = await render([]);
    expect(html).toContain('Hot This Week');
  });

  it('should render "Feature Your Plugin" CTA', async () => {
    const { html } = await render([]);
    expect(html).toContain('Feature Your Plugin');
  });

  it('should link to GitHub issue template for featuring', async () => {
    const { html } = await render([]);
    expect(html).toContain('https://github.com/QAInsights/plugins.jmeter.ai/issues/new?template=feature_plugin.md');
  });

  it('should render exactly 2 PluginCards when 5 plugins provided', async () => {
    const plugins = makePluginsList(5);
    const { html } = await render(plugins);
    // Each PluginCard renders a div with class "plugin-card"
    const cardMatches = html.match(/class="[^"]*plugin-card[^"]*"/g);
    expect(cardMatches).toHaveLength(2);
  });

  it('should render 0 PluginCards when empty array', async () => {
    const { html } = await render([]);
    expect(html).not.toContain('data-plugin-id');
  });

  it('should render 1 PluginCard when only 1 plugin provided', async () => {
    const plugins = makePluginsList(1);
    const { html } = await render(plugins);
    const cardMatches = html.match(/class="[^"]*plugin-card[^"]*"/g);
    expect(cardMatches).toHaveLength(1);
  });

  it('should render exactly min(2, N) PluginCards', async () => {
    const plugins = makePluginsList(2);
    const { html } = await render(plugins);
    const cardMatches = html.match(/class="[^"]*plugin-card[^"]*"/g);
    expect(cardMatches).toHaveLength(2);
  });
});
