#!/usr/bin/env node
/**
 * Report which keys a locale is missing, and which of its values are still
 * byte-identical to English, which is the usual sign of an unfinished
 * translation. Several keys are legitimately identical across languages
 * (brand names, "Chat"), so this is a report for a human translator to read,
 * not a pass/fail gate; `tests/locales.test.js` is the gate.
 *
 * Usage: node scripts/locale-status.mjs [locale ...]
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const localesRoot = join(root, "_locales");

const read = (locale) =>
  JSON.parse(readFileSync(join(localesRoot, locale, "messages.json"), "utf8"));

const en = read("en");
const requested = process.argv.slice(2);
const targets = requested.length
  ? requested
  : readdirSync(localesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((locale) => locale !== "en")
      .sort();

let incomplete = 0;
for (const locale of targets) {
  const messages = read(locale);
  const missing = Object.keys(en).filter((key) => !(key in messages));
  const identical = Object.keys(en).filter((key) => messages[key]?.message === en[key].message);
  const undocumented = Object.keys(messages).filter((key) => !messages[key].description);
  if (missing.length) incomplete += 1;

  console.log(
    `${locale.padEnd(7)} keys=${String(Object.keys(messages).length).padStart(3)} ` +
      `missing=${String(missing.length).padStart(3)} ` +
      `identical-to-en=${String(identical.length).padStart(3)} ` +
      `no-description=${String(undocumented.length).padStart(3)}`,
  );
  if (missing.length) console.log(`  missing:   ${missing.join(", ")}`);
  if (identical.length) console.log(`  identical: ${identical.join(", ")}`);
}

console.log(`\n${incomplete} of ${targets.length} locales are missing keys.`);
