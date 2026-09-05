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
    ignores: ["lib/providers/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            "Only lib/providers/*.js may call fetch() directly (Provider Pattern, AGENTS.md Core Directive #4). Route AI-provider calls through lib/ai-service.js. If this is a legitimate non-AI fetch (a local extension resource via chrome.runtime.getURL, for example), add a commented eslint-disable-next-line explaining why.",
        },
      ],
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
