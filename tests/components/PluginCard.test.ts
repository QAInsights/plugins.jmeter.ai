import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import PluginCard from '../../src/components/PluginCard.astro';
import { makePlugin } from '../fixtures/plugins';

async function render(plugin: any) {
  const container = await AstroContainer.create();
  const html = await container.renderToString(PluginCard, { props: { plugin } });
  return { html };
}

describe('PluginCard', () => {
  it('should render plugin name, vendor, description, and id', async () => {
    const plugin = makePlugin();
    const { html } = await render(plugin);
    expect(html).toContain('Test Plugin');
    expect(html).toContain('TestVendor');
    expect(html).toContain('A test plugin for unit testing');
    expect(html).toContain('test-plugin');
  });

  it('should format absoluteDownloads with thousands separators', async () => {
    const plugin = makePlugin({ stats: { ...makePlugin().stats, absoluteDownloads: 1234567 } });
    const { html } = await render(plugin);
    expect(html).toContain('1,234,567');
  });

  it('should render positive trending delta with + prefix in green', async () => {
    const plugin = makePlugin({ stats: { ...makePlugin().stats, trendingDelta: 500 } });
    const { html } = await render(plugin);
    expect(html).toContain('+500');
    expect(html).toContain('text-green-600');
  });

  it('should render negative trending delta in red', async () => {
    const plugin = makePlugin({ stats: { ...makePlugin().stats, trendingDelta: -200 } });
    const { html } = await render(plugin);
    expect(html).toContain('-200');
    expect(html).toContain('text-red-500');
  });

  it('should not render trending indicator when delta is 0', async () => {
    const plugin = makePlugin({ stats: { ...makePlugin().stats, trendingDelta: 0 } });
    const { html } = await render(plugin);
    // The trending spans have title="Downloads this week" — verify neither is rendered
    expect(html).not.toContain('+0');
    expect(html).not.toMatch(/title="Downloads this week"/);
  });

  it('should render AI Ready tag when isAiReady is true', async () => {
    const plugin = makePlugin({ isAiReady: true });
    const { html } = await render(plugin);
    expect(html).toContain('AI Ready');
  });

  it('should render Sponsored tag when sponsored is true', async () => {
    const plugin = makePlugin({ sponsored: true });
    const { html } = await render(plugin);
    expect(html).toContain('Sponsored');
  });

  it('should render Featured tag when isFeatured is true', async () => {
    const plugin = makePlugin({ isFeatured: true });
    const { html } = await render(plugin);
    expect(html).toContain('Featured');
  });

  it('should render all three tags when all flags are true', async () => {
    const plugin = makePlugin({ isAiReady: true, sponsored: true, isFeatured: true });
    const { html } = await render(plugin);
    expect(html).toContain('AI Ready');
    expect(html).toContain('Sponsored');
    expect(html).toContain('Featured');
  });

  it('should not render any tag block when no flags are true', async () => {
    const plugin = makePlugin();
    const { html } = await render(plugin);
    // Tag badge CSS classes should not appear (the words "Featured"/"Sponsored"/"AI Ready"
    // also exist inside data-plugin JSON as key names, so check badge-specific classes)
    expect(html).not.toContain('bg-purple-100');      // Featured badge
    expect(html).not.toContain('bg-secondary/10');    // Sponsored badge
    expect(html).not.toContain('text-primary-dark');  // AI Ready badge
  });

  it('should infer category Assertions from componentClasses', async () => {
    const plugin = makePlugin({ componentClasses: ['com.test.Assertion'] });
    const { html } = await render(plugin);
    expect(html).toContain('Assertions');
  });

  it('should infer category Listeners from componentClasses with listener', async () => {
    const plugin = makePlugin({ componentClasses: ['com.test.Listener'] });
    const { html } = await render(plugin);
    expect(html).toContain('Listeners');
  });

  it('should infer category Listeners from componentClasses with visualizer', async () => {
    const plugin = makePlugin({ componentClasses: ['com.test.Visualizer'] });
    const { html } = await render(plugin);
    expect(html).toContain('Listeners');
  });

  it('should infer category Samplers from componentClasses', async () => {
    const plugin = makePlugin({ componentClasses: ['com.test.Sampler'] });
    const { html } = await render(plugin);
    expect(html).toContain('Samplers');
  });

  it('should infer category Configs from componentClasses', async () => {
    const plugin = makePlugin({ componentClasses: ['com.test.Config'] });
    const { html } = await render(plugin);
    expect(html).toContain('Configs');
  });

  it('should infer category Timers from componentClasses', async () => {
    const plugin = makePlugin({ componentClasses: ['com.test.Timer'] });
    const { html } = await render(plugin);
    expect(html).toContain('Timers');
  });

  it('should infer category Processors from componentClasses', async () => {
    const plugin = makePlugin({ componentClasses: ['com.test.Processor'] });
    const { html } = await render(plugin);
    expect(html).toContain('Processors');
  });

  it('should default to Others when componentClasses is missing', async () => {
    const plugin = makePlugin({ componentClasses: undefined });
    const { html } = await render(plugin);
    expect(html).toContain('Others');
  });

  it('should default to Others when componentClasses has no matching keyword', async () => {
    const plugin = makePlugin({ componentClasses: ['com.test.Unknown'] });
    const { html } = await render(plugin);
    expect(html).toContain('Others');
  });

  it('should pick first matching category in priority order (assertion > listener)', async () => {
    const plugin = makePlugin({ componentClasses: ['com.test.Assertion', 'com.test.Listener'] });
    const { html } = await render(plugin);
    expect(html).toContain('Assertions');
    expect(html).not.toContain('Listeners');
  });

  it('should set data-category lowercased', async () => {
    const plugin = makePlugin({ componentClasses: ['com.test.Assertion'] });
    const { html } = await render(plugin);
    expect(html).toContain('data-category="assertions"');
  });

  it('should set data-plugin attribute containing the plugin id', async () => {
    const plugin = makePlugin();
    const { html } = await render(plugin);
    // The attribute value is HTML-encoded JSON; just verify the id is present
    expect(html).toContain('data-plugin=');
    // The encoded JSON should contain the plugin id string
    expect(html).toMatch(/data-plugin="[^"]*test-plugin[^"]*"/);
  });

  it('should render copy-id-btn with data-plugin-id', async () => {
    const plugin = makePlugin();
    const { html } = await render(plugin);
    expect(html).toContain('data-plugin-id="test-plugin"');
  });

  it('should add ai-glow-wrapper class when isAiReady is true', async () => {
    const plugin = makePlugin({ isAiReady: true });
    const { html } = await render(plugin);
    expect(html).toContain('ai-glow-wrapper');
  });

  it('should not add ai-glow-wrapper class when isAiReady is false', async () => {
    const plugin = makePlugin({ isAiReady: false });
    const { html } = await render(plugin);
    expect(html).not.toContain('ai-glow-wrapper');
  });

  it('should render gradient highlight bar when sponsored or isFeatured', async () => {
    const plugin = makePlugin({ sponsored: true });
    const { html } = await render(plugin);
    expect(html).toContain('bg-gradient-to-r from-primary to-secondary');
  });

  it('should not render gradient highlight bar when neither sponsored nor isFeatured', async () => {
    const plugin = makePlugin();
    const { html } = await render(plugin);
    // The gradient div is inside a conditional, so it shouldn't appear
    const matches = html.match(/bg-gradient-to-r from-primary to-secondary/g);
    expect(matches).toBeNull();
  });

  it('should render compare-checkbox with data-plugin-id', async () => {
    const plugin = makePlugin();
    const { html } = await render(plugin);
    expect(html).toContain('compare-checkbox');
  });

  it('should render a favorite-btn button', async () => {
    const plugin = makePlugin();
    const { html } = await render(plugin);
    expect(html).toContain('class="favorite-btn');
  });

  it('should set data-plugin-id on the favorite-btn matching the plugin id', async () => {
    const plugin = makePlugin();
    const { html } = await render(plugin);
    // The favorite-btn must carry data-plugin-id="test-plugin"
    expect(html).toMatch(/favorite-btn[^>]*data-plugin-id="test-plugin"/s);
  });

  it('should render fav-icon-outline inside the favorite-btn', async () => {
    const plugin = makePlugin();
    const { html } = await render(plugin);
    expect(html).toContain('fav-icon-outline');
  });

  it('should render fav-icon-filled as hidden by default', async () => {
    const plugin = makePlugin();
    const { html } = await render(plugin);
    expect(html).toContain('fav-icon-filled');
    expect(html).toContain('fav-icon-filled w-4 h-4 hidden');
  });

  it('should set aria-label="Add to favorites" on the favorite-btn', async () => {
    const plugin = makePlugin();
    const { html } = await render(plugin);
    expect(html).toContain('aria-label="Add to favorites"');
  });

  it('should include onclick="event.stopPropagation()" on the favorite-btn', async () => {
    const plugin = makePlugin();
    const { html } = await render(plugin);
    expect(html).toContain('onclick="event.stopPropagation()"');
  });
});
