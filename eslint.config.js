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
    // NOTE: both restricted-syntax selectors below (Provider Pattern + Storage Map) MUST live in
    // this single config object's "no-restricted-syntax" array. ESLint flat config does not merge
    // same-named rule entries across multiple matching config objects — the last one applicable to
    // a given file wins outright, silently discarding any earlier one. Splitting these into two
    // separate objects (as originally written) made the Storage Map rule's object shadow the
    // Provider Pattern rule for every file both applied to, which went undetected until the
    // Provider Pattern's own regression test caught it. Combining the exemption globs is safe in
    // practice: lib/providers/** never touches chrome.storage.*, and none of the Storage Map's
    // owner files (or tests/**, e2e/**) call fetch() directly — verified via grep before merging.
    ignores: [
      "lib/providers/**",
      "lib/theme-manager.js",
      "lib/history.js",
      "lib/storage.js",
      "tests/**",
      "e2e/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            "Only lib/providers/*.js may call fetch() directly (Provider Pattern, AGENTS.md Core Directive #4). Route AI-provider calls through lib/ai-service.js. If this is a legitimate non-AI fetch (a local extension resource via chrome.runtime.getURL, for example), add a commented eslint-disable-next-line explaining why.",
        },
        {
          selector:
            "MemberExpression[object.object.object.name='chrome'][object.object.property.name='storage']",
          message:
            "Only lib/theme-manager.js (omni_ai_theme), lib/history.js (history/usage stats), and lib/storage.js (everything else) may access chrome.storage.* directly (Storage Map contract, AGENTS.md). Route new storage access through one of those three, or add a commented eslint-disable-next-line explaining why this call is a genuine exception (e.g. session-scoped ephemeral state, a one-time bulk defaults merge).",
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
