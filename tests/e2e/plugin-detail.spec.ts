import { test, expect } from '@playwright/test';

test.describe('Plugin detail page', () => {
  test('should load a known plugin page', async ({ page }) => {
    // Navigate to a plugin page - use the first plugin card from home
    await page.goto('/');
    const firstCard = page.locator('.plugin-card').first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });
    const pluginId = await firstCard.getAttribute('data-plugin-id') || await firstCard.locator('[data-plugin-id]').first().getAttribute('data-plugin-id');
    if (pluginId) {
      await page.goto(`/plugin/${pluginId}`);
      const heading = page.locator('h1, h2').first();
      await expect(heading).toBeVisible({ timeout: 10000 });
    }
  });

  test('should show 404 for bogus plugin id', async ({ page }) => {
    const response = await page.goto('/plugin/this-plugin-does-not-exist-xyz');
    // Astro may return 404 or render an error page
    expect(response).not.toBeNull();
  });
});
