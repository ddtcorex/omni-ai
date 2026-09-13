Object.assign(global, require("jest-chrome"));

// jsdom lacks these Node globals used by streaming provider tests.
const nodeUtil = require("node:util");
const nodeWebStreams = require("node:stream/web");
for (const name of ["TextEncoder", "TextDecoder", "AbortController", "AbortSignal"]) {
  if (typeof global[name] === "undefined" && typeof nodeUtil[name] !== "undefined") {
    global[name] = nodeUtil[name];
  }
}
for (const name of ["ReadableStream", "WritableStream", "TransformStream"]) {
  if (typeof global[name] === "undefined" && typeof nodeWebStreams[name] !== "undefined") {
    global[name] = nodeWebStreams[name];
  }
}
