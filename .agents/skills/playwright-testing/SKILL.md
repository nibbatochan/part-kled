---
name: playwright-testing
description: Best practices and workflows for writing, running, and debugging Playwright end-to-end (E2E), integration, component, and visual regression tests. Use when creating or updating Playwright tests, automating browser workflows, debugging test flakes, configuring playwright.config, or inspecting traces and screenshots.
---

# Playwright Testing Best Practices & Workflows

A guide for writing, running, and debugging end-to-end (E2E), integration, and visual regression tests with Playwright.

---

## 1. Core Principles

1. **User-Visible Locators First:** Always prefer locators that reflect how users perceive the page rather than CSS or XPath selectors:
   - `page.getByRole('button', { name: 'Submit' })`
   - `page.getByText('Welcome back')`
   - `page.getByLabel('Email address')`
   - `page.getByPlaceholder('Search...')`
   - `page.getByTestId('custom-id')` (fallback when accessible roles are insufficient)
2. **Auto-Waiting & Web-First Assertions:**
   - Use `await expect(locator).toBeVisible()` or `await expect(locator).toHaveText(...)`.
   - Never use arbitrary `page.waitForTimeout()` in production test suites; rely on Playwright's built-in auto-waiting assertions.
3. **Isolated Browser Contexts:**
   - Each test should execute in an isolated `BrowserContext` to avoid shared cookies, localStorage, or session state leakage.

---

## 2. Common Workflows

### Running Tests
```bash
# Run all Playwright tests
npx playwright test

# Run a specific test file
npx playwright test tests/e2e/auth.spec.ts

# Run in headed mode (visible browser)
npx playwright test --headed

# Run with interactive UI mode
npx playwright test --ui

# Debug tests step-by-step
npx playwright test --debug
```

### Visual Regression & Screenshot Testing
```ts
import { test, expect } from '@playwright/test';

test('visual comparison of landing hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#hero')).toBeVisible();
  await expect(page).toHaveScreenshot('landing-hero.png', {
    maxDiffPixelRatio: 0.05,
  });
});
```

### Network Mocking & Interception
```ts
test('mocks API error handling', async ({ page }) => {
  await page.route('**/api/user/profile', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal Server Error' }),
    });
  });

  await page.goto('/profile');
  await expect(page.getByText('Failed to load profile')).toBeVisible();
});
```

### Inspecting Traces & Test Failures
```bash
# View the trace recorded during a test failure
npx playwright show-trace test-results/failed-test/trace.zip
```

---

## 3. Configuration Checklist (`playwright.config.ts`)
- Set `trace: 'on-first-retry'` or `'retain-on-failure'`.
- Set `screenshot: 'only-on-failure'`.
- Enable parallel execution with `fullyParallel: true`.
- Configure `webServer` in `playwright.config.ts` so tests automatically start the local dev server if not already running.
