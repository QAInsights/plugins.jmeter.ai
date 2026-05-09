import { test, expect } from '@playwright/test';

test.describe('Vendor pages', () => {
  test('should load the vendors directory index page', async ({ page }) => {
    await page.goto('/vendor/');
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should load an individual vendor page', async ({ page }) => {
    await page.goto('/vendor/blazemeter/');
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });
});
