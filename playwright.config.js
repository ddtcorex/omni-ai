/** @type {import('@playwright/test').Config} */
module.exports = {
  testDir: "./e2e",
  // Scope guard (carry-forward from T7): ONLY *.spec.js under e2e/ is a
  // Playwright spec. Jest's tests/**/*.test.js lives outside testDir AND
  // fails this testMatch, so a bare `npx playwright test` can never sweep it.
  testMatch: /.*\.spec\.js$/,
  timeout: 30000,
  use: { headless: true },
};
