import { test, expect } from '@playwright/test';

test.describe('Collections pages', () => {
  test('should load the collections index page', async ({ page }) => {
    await page.goto('/collections/');
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should load an individual collection page', async ({ page }) => {
    await page.goto('/collections/ai-ready/');
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });
});
