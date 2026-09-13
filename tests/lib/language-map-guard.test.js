const fs = require("fs");
const path = require("path");

describe("language name maps stay consolidated", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../lib/ai-service.js"), "utf8");

  test("ai-service.js no longer declares a local languageNames map", () => {
    expect(source).not.toMatch(/languageNames\s*=/);
  });

  test("ai-service.js resolves names through the shared registry", () => {
    expect(source).toMatch(/resolveLanguageName/);
  });

  test("no hardcoded language name table survives in ai-service.js", () => {
    // "Chinese (Simplified)" used to be copied into two separate maps here.
    expect(source).not.toContain('"Chinese (Simplified)"');
  });
});
