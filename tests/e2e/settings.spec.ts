import { test, expect } from '@playwright/test';

test.describe('Settings page', () => {
  test('should load the settings page', async ({ page }) => {
    await page.goto('/settings/');
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
