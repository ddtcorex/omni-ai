module.exports = {
  setupFilesAfterEnv: ["./jest.setup.js"],
  testEnvironment: "jsdom",
  // Scope Jest to tests/**/*.test.js ONLY: Playwright's e2e/*.spec.js specs
  // match Jest's default "*.spec" pattern and crash when run under jsdom.
  // Mirror guard of playwright.config.js testDir/testMatch scoping.
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  transform: {
    "^.+\\.js$": "babel-jest",
  },
};
