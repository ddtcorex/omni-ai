#!/usr/bin/env node
/**
 * Capture real model-list payloads into tests/fixtures/models/.
 *
 * The unit tests normalize whatever the vendors' SDK types promise. This script
 * is the only way to replace that promise with an observed payload, so the
 * fixtures stop being guesses. It never prints or stores a key: it reads one
 * from the environment, uses it, and writes only the response body.
 *
 * Usage:
 *   node scripts/capture-model-fixtures.mjs
 *
 * Providers whose key is absent are skipped, not failed, so you can run it with
 * whatever you happen to have. OpenRouter's catalog needs no key at all and is
 * captured by default: its payload is the OpenAI-compatible shape the OpenAI,
 * Groq and Custom Gateway normalizers share.
 *
 * Exit code is 1 only when nothing at all could be captured.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(RAIZ, "tests", "fixtures", "models");

/** How many entries to keep. Field names and values stay untouched. */
const KEEP = 5;

const TARGETS = [
  {
    name: "openrouter",
    endpoint: "https://openrouter.ai/api/v1/models",
    keyEnv: null,
    headers: () => ({}),
    listingPath: "/models",
    note: "public endpoint, OpenAI-compatible shape",
  },
  {
    name: "openai",
    endpoint: "https://api.openai.com/v1/models",
    keyEnv: "OPENAI_API_KEY",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: "groq",
    endpoint: "https://api.groq.com/openai/v1/models",
    keyEnv: "GROQ_API_KEY",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: "anthropic",
    endpoint: "https://api.anthropic.com/v1/models?limit=5",
    keyEnv: "ANTHROPIC_API_KEY",
    headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  },
  {
    name: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=5&key=",
    keyEnv: "GEMINI_API_KEY",
    headers: () => ({}),
    keyInQuery: true,
  },
];

/**
 * Keep the first entries of whichever array the provider uses, plus the
 * envelope keys a normalizer reads (has_more, nextPageToken, and friends).
 * @param {any} body
 */
function trim(body) {
  const entries = body?.data || body?.models || [];
  const envelope = {};
  for (const key of ["has_more", "first_id", "last_id", "nextPageToken"]) {
    if (key in (body || {})) envelope[key] = body[key];
  }
  return { total: entries.length, envelope, entries: entries.slice(0, KEEP) };
}

async function capture(target) {
  const key = target.keyEnv ? process.env[target.keyEnv] : null;
  if (target.keyEnv && !key) {
    return { name: target.name, status: "skipped", detail: `${target.keyEnv} is not set` };
  }

  const url = target.keyInQuery ? `${target.endpoint}${key}` : target.endpoint;

  try {
    // Maintainer script that runs in node and is never shipped in the
    // extension; calling the provider once is the whole job of this file.
    // eslint-disable-next-line no-restricted-syntax
    const response = await fetch(url, { headers: target.headers(key) });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        name: target.name,
        status: "failed",
        detail: `HTTP ${response.status} ${body?.error?.message || ""}`.trim(),
      };
    }

    const { total, envelope, entries } = trim(body);
    if (entries.length === 0) {
      return { name: target.name, status: "failed", detail: "no entries in the response" };
    }

    await mkdir(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `${target.name}.json`);
    await writeFile(
      file,
      `${JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          endpoint: target.endpoint.replace(/key=$/, "key=REDACTED"),
          entriesInResponse: total,
          kept: entries.length,
          ...envelope,
          entries,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    return { name: target.name, status: "captured", detail: `${entries.length}/${total} entries` };
  } catch (error) {
    return { name: target.name, status: "failed", detail: error.message };
  }
}

const results = [];
for (const target of TARGETS) {
  results.push(await capture(target));
}

for (const result of results) {
  console.log(`${result.status.padEnd(9)} ${result.name.padEnd(10)} ${result.detail}`);
}

const captured = results.filter((r) => r.status === "captured").length;
console.log(
  `\n${captured} captured, ${results.filter((r) => r.status === "skipped").length} skipped, ` +
    `${results.filter((r) => r.status === "failed").length} failed`,
);

if (captured === 0) {
  console.error("Nothing captured: set at least one provider key.");
  process.exit(1);
}
