import { test, expect } from '@playwright/test';

test.describe('Compare page', () => {
  test('should load the compare page', async ({ page }) => {
    await page.goto('/compare');
    // Page should render — check for some content
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should show comparison when ids are provided via query params', async ({ page }) => {
    // We need at least 2 valid plugin ids — get them from the home page
    await page.goto('/');
    const cards = page.locator('.plugin-card');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    const count = await cards.count();
    if (count >= 2) {
      const id1 = await cards.nth(0).locator('[data-plugin-id]').first().getAttribute('data-plugin-id');
      const id2 = await cards.nth(1).locator('[data-plugin-id]').first().getAttribute('data-plugin-id');
      if (id1 && id2) {
        await page.goto(`/compare?ids=${id1},${id2}`);
        const table = page.locator('table');
        await expect(table).toBeVisible({ timeout: 10000 });
      }
    }
  });
});
