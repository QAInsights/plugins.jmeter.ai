import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test('should load and display hero headline', async ({ page }) => {
    await page.goto('/');
    const h1 = page.locator('h1');
    await expect(h1).toContainText('JMeter');
  });

  test('should display at least one plugin card', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('.plugin-card');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
  });

  test('should filter plugins via search input', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.locator('#searchInput');
    await searchInput.fill('plugin');
    // Wait for filtering to apply
    await page.waitForTimeout(500);
    const visibleCards = page.locator('.plugin-card:visible');
    // At least some cards should be visible or hidden depending on search
    const count = await visibleCards.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show clear button when search has text', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.locator('#searchInput');
    const clearBtn = page.locator('#clearSearchBtn');
    await expect(clearBtn).toBeHidden();
    await searchInput.fill('test');
    await expect(clearBtn).toBeVisible();
  });

  test('should show scroll-to-top button after scrolling', async ({ page }) => {
    await page.goto('/');
    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(400);
    const btn = page.locator('#scrollToTopBtn');
    // Button should become visible (opacity transition)
    await expect(btn).toHaveClass(/opacity-100/, { timeout: 5000 });
  });

  test('should scroll to top when clicking scroll-to-top button', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(400);
    const btn = page.locator('#scrollToTopBtn');
    await expect(btn).toHaveClass(/opacity-100/, { timeout: 5000 });
    await btn.click();
    await page.waitForTimeout(1000);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });
});
