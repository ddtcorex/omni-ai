/**
 * Characterization tests for the OpenAI provider (shipped behavior).
 *
 * Pins: the fixed v1/chat/completions endpoint, Bearer auth header, registry
 * model mapping via getApiModelName, max_completion_tokens (NOT max_tokens),
 * and error-payload propagation.
 */
describe("OpenAI Provider", () => {
  let generateContent;

  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn();
    generateContent = require("../../../lib/providers/openai").generateContent;
  });

  it("throws when apiKey is missing and never calls fetch", async () => {
    await expect(generateContent("p", {})).rejects.toThrow("OpenAI API key not configured");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("POSTs chat/completions with Bearer auth and returns message.content", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    await expect(
      generateContent("prompt", { apiKey: "sk-test", model: "gpt-4o-mini", temperature: 0.3 }),
    ).resolves.toBe("ok");

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-4o-mini"); // resolved via getApiModelName (apiModel lookup)
    expect(body.messages).toEqual([{ role: "user", content: "prompt" }]);
    expect(body.temperature).toBe(0.3);
    expect(body.max_completion_tokens).toBe(4096); // OpenAI newer param — NOT legacy max_tokens
    expect(body.max_tokens).toBeUndefined();
  });

  it("throws on http error payloads", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => "application/json" },
      json: async () => ({ error: { message: "invalid key" } }),
    });
    await expect(generateContent("p", { apiKey: "bad", model: "gpt-4o" })).rejects.toThrow(
      "invalid key",
    );
  });
});
