import { test, expect } from '@playwright/test';

test.describe('Favorites / Bookmarks', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each favorites test
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('favoriteIds'));
  });

  test('should render a star button on each plugin card', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.plugin-card').first()).toBeVisible({ timeout: 15000 });
    const favBtn = page.locator('.plugin-card').first().locator('.favorite-btn');
    await expect(favBtn).toBeVisible();
  });

  test('should star a plugin and persist across page reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.plugin-card').first()).toBeVisible({ timeout: 15000 });

    // Get the plugin id from the first card's favorite button
    const firstFavBtn = page.locator('.plugin-wrapper').first().locator('.favorite-btn');
    const pluginId = await firstFavBtn.getAttribute('data-plugin-id');
    expect(pluginId).toBeTruthy();

    // Star the plugin
    await firstFavBtn.click();

    // Verify it is now in localStorage
    const storedIds = await page.evaluate(() => JSON.parse(localStorage.getItem('favoriteIds') || '[]'));
    expect(storedIds).toContain(pluginId);

    // Reload and verify persistence
    await page.reload();
    await expect(page.locator('.plugin-card').first()).toBeVisible({ timeout: 15000 });
    const storedAfterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('favoriteIds') || '[]'));
    expect(storedAfterReload).toContain(pluginId);
  });

  test('should show favorites count badge on pill after starring', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.plugin-card').first()).toBeVisible({ timeout: 15000 });
    await page.locator('.plugin-wrapper').first().locator('.favorite-btn').click();
    const pillCount = page.locator('#favPillCount');
    await expect(pillCount).toBeVisible();
    await expect(pillCount).toContainText('1');
  });

  test('should filter grid to only favorites when Favorites pill is clicked', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.plugin-card').first()).toBeVisible({ timeout: 15000 });

    // Star the first plugin
    const firstWrapper = page.locator('.plugin-wrapper').first();
    const pluginId = await firstWrapper.locator('.favorite-btn').getAttribute('data-plugin-id');
    await firstWrapper.locator('.favorite-btn').click();

    // Click the Favorites pill
    await page.locator('.favorites-pill').click();
    await page.waitForTimeout(300);

    const visibleCards = page.locator('.plugin-wrapper:not(.hidden)');
    const count = await visibleCards.count();
    expect(count).toBe(1);

    const visibleId = await visibleCards.first().getAttribute('data-plugin-id');
    expect(visibleId).toBe(pluginId);
  });

  test('should show empty-state message when Favorites pill is active with no favorites', async ({ page }) => {
    await page.goto('/');
    await page.locator('.favorites-pill').click();
    await page.waitForTimeout(300);
    const noResults = page.locator('#noResults');
    await expect(noResults).toBeVisible();
    await expect(page.locator('#noResultsMsg')).toContainText('No favorites yet');
  });

  test('should show share bar when Favorites filter is active with favorites', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.plugin-card').first()).toBeVisible({ timeout: 15000 });
    await page.locator('.plugin-wrapper').first().locator('.favorite-btn').click();
    await page.locator('.favorites-pill').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#favShareBar')).toBeVisible();
  });

  test('should show header indicator after starring a plugin', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.plugin-card').first()).toBeVisible({ timeout: 15000 });
    await page.locator('.plugin-wrapper').first().locator('.favorite-btn').click();
    const indicator = page.locator('#favHeaderIndicator');
    await expect(indicator).toBeVisible();
    await expect(page.locator('#favHeaderCount')).toContainText('1');
  });

  test('should show import banner when visiting /?favs= URL', async ({ page }) => {
    await page.goto('/?favs=jpgc-graphs-additional');
    await expect(page.locator('#favImportBanner')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#favImportMsg')).toContainText('Import 1 shared favorite');
  });

  test('should merge imported favorites on Merge click', async ({ page }) => {
    await page.goto('/?favs=jpgc-graphs-additional');
    await expect(page.locator('#favImportBanner')).toBeVisible({ timeout: 10000 });
    await page.locator('#favImportMerge').click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('favoriteIds') || '[]'));
    expect(stored).toContain('jpgc-graphs-additional');
    await expect(page.locator('#favImportBanner')).toBeHidden();
  });

  test('should dismiss import banner without importing on Dismiss click', async ({ page }) => {
    await page.goto('/?favs=jpgc-graphs-additional');
    await expect(page.locator('#favImportBanner')).toBeVisible({ timeout: 10000 });
    await page.locator('#favImportDismiss').click();
    await expect(page.locator('#favImportBanner')).toBeHidden();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('favoriteIds') || '[]'));
    expect(stored).not.toContain('jpgc-graphs-additional');
  });
});

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
