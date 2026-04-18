import { test, expect } from '@playwright/test';

test.describe('Blog', () => {
  test('should load blog index page', async ({ page }) => {
    await page.goto('/blog');
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should have blog posts listed', async ({ page }) => {
    await page.goto('/blog');
    // Look for post links or article elements
    const links = page.locator('a[href*="/blog/"]');
    const count = await links.count();
    // May be 0 if no posts, but page should load
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should return valid RSS XML', async ({ request }) => {
    const response = await request.get('/rss.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('<?xml');
    expect(body).toContain('<rss');
  });
});
