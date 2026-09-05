const globals = require("globals");
const eslintConfigPrettier = require("eslint-config-prettier");

module.exports = [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".webext-profile/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.serviceworker, chrome: "readonly" },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-var": "warn",
      eqeqeq: ["error", "smart"],
    },
  },
  {
    files: ["tests/**/*.js", "e2e/**/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },
  // Must stay last: turns off every stylistic rule that would fight Prettier.
  // Implements the Task-6 interface "Consumes: eslint-config-prettier".
  eslintConfigPrettier,
];
