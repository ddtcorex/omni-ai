// Repo-owned Chrome API mock. `jest-chrome` is abandoned (peer jest ^26 || ^27)
// and blocks jest 30; see tests/helpers/chrome-mock.js for the covered surface.
global.chrome = require("./tests/helpers/chrome-mock").createChromeMock();

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
